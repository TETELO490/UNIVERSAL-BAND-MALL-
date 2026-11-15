package com.universalband.mall;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Background Android BroadcastReceiver that automatically inspects incoming SMS messages
 * even when the Universal Band app is closed or running in the background.
 *
 * Only runs when Admin Payment Confirmation is enabled on this device, and only marks
 * matching orders/tickets PAID when BOTH the configured Bank Message keyword AND an order
 * reference (matching Reference Format, e.g. UB-1234) are detected.
 */
public class SmsPaymentReceiver extends BroadcastReceiver {

    public static final String PREFS_NAME = "UbLivePaymentPrefs";
    public static final String ACTION_LIVE_PAYMENT_SMS = "com.universalband.mall.LIVE_PAYMENT_SMS";
    private static final String CHANNEL_ID = "ub_live_payments";
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) {
            return;
        }

        boolean readGranted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_SMS
        ) == PackageManager.PERMISSION_GRANTED;
        boolean receiveGranted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECEIVE_SMS
        ) == PackageManager.PERMISSION_GRANTED;
        if (!readGranted && !receiveGranted) {
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        boolean enabled = prefs.getBoolean("enabled", true);
        boolean isAdminDevice = prefs.getBoolean("isAdminDevice", false);
        if (!enabled || !isAdminDevice) {
            return;
        }

        SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (messages == null || messages.length == 0) {
            return;
        }

        String sender = "";
        StringBuilder bodyBuilder = new StringBuilder();
        long timestamp = System.currentTimeMillis();

        for (SmsMessage msg : messages) {
            if (msg == null) continue;
            if (sender.isEmpty() && msg.getDisplayOriginatingAddress() != null) {
                sender = msg.getDisplayOriginatingAddress();
            }
            if (msg.getMessageBody() != null) {
                bodyBuilder.append(msg.getMessageBody());
            }
            if (msg.getTimestampMillis() > 0) {
                timestamp = msg.getTimestampMillis();
            }
        }

        final String finalSender = sender != null ? sender.trim() : "";
        final String finalBody = bodyBuilder.toString().trim();
        final long finalTimestamp = timestamp;

        if (finalBody.isEmpty()) {
            return;
        }

        String bankMessage = prefs.getString("bankMessage", "TymeBank");
        String referenceFormat = prefs.getString("referenceFormat", "UB-");
        if (bankMessage == null || bankMessage.trim().isEmpty()) bankMessage = "TymeBank";
        if (referenceFormat == null || referenceFormat.trim().isEmpty()) referenceFormat = "UB-";

        String matchedBankWord = findMatchingBankKeyword(finalSender + " " + finalBody, bankMessage);
        if (matchedBankWord == null) {
            return;
        }

        String matchedReference = extractOrderReference(finalBody, referenceFormat);
        if (matchedReference == null) {
            return;
        }

        // Notify in-process Capacitor plugin immediately if app WebView is alive
        Intent internalIntent = new Intent(ACTION_LIVE_PAYMENT_SMS);
        internalIntent.setPackage(context.getPackageName());
        internalIntent.putExtra("id", "bg_" + finalTimestamp + "_" + finalSender);
        internalIntent.putExtra("sender", finalSender);
        internalIntent.putExtra("body", finalBody);
        internalIntent.putExtra("dateMs", finalTimestamp);
        context.sendBroadcast(internalIntent);

        final String projectId = prefs.getString("projectId", "");
        final String databaseId = prefs.getString("databaseId", "(default)");
        final String apiKey = prefs.getString("apiKey", "");
        final String refreshToken = prefs.getString("refreshToken", "");

        if (projectId == null || projectId.trim().isEmpty()) {
            return;
        }

        final PendingResult pendingResult = goAsync();
        final Context appCtx = context.getApplicationContext();
        final String refUpper = matchedReference.toUpperCase(Locale.ROOT);

        EXECUTOR.execute(() -> {
            try {
                String isoNow = formatIsoUtc(finalTimestamp);
                String idToken = refreshIdToken(apiKey, refreshToken);

                boolean confirmedOrderOrTicket = false;
                String confirmedRef = refUpper;

                // 1. Check direct ticket document ID (e.g. tickets/UB-12345)
                JSONObject directTicket = getFirestoreDoc(
                    projectId, databaseId, apiKey, idToken, "tickets/" + urlEncode(refUpper)
                );
                if (directTicket != null && !isDocAlreadyPaid(directTicket)) {
                    confirmedOrderOrTicket = markTicketPaidInFirestore(
                        projectId, databaseId, apiKey, idToken, refUpper, refUpper, finalBody, isoNow
                    );
                }

                // 2. Fallback query on tickets (ticketId / bandCode / payshapReference)
                if (!confirmedOrderOrTicket) {
                    String foundTicketDocId = queryDocIdByField(
                        projectId, databaseId, apiKey, idToken, "tickets", "ticketId", refUpper
                    );
                    if (foundTicketDocId == null) {
                        foundTicketDocId = queryDocIdByField(
                            projectId, databaseId, apiKey, idToken, "tickets", "bandCode", refUpper
                        );
                    }
                    if (foundTicketDocId == null) {
                        foundTicketDocId = queryDocIdByField(
                            projectId, databaseId, apiKey, idToken, "tickets", "payshapReference", matchedReference
                        );
                    }
                    if (foundTicketDocId != null) {
                        JSONObject ticketDoc = getFirestoreDoc(
                            projectId, databaseId, apiKey, idToken, "tickets/" + urlEncode(foundTicketDocId)
                        );
                        if (ticketDoc != null && !isDocAlreadyPaid(ticketDoc)) {
                            confirmedOrderOrTicket = markTicketPaidInFirestore(
                                projectId, databaseId, apiKey, idToken, foundTicketDocId, refUpper, finalBody, isoNow
                            );
                        }
                    }
                }

                // 3. Fallback query on mall_orders (orderNumber / collectionCode)
                if (!confirmedOrderOrTicket) {
                    String foundOrderDocId = queryDocIdByField(
                        projectId, databaseId, apiKey, idToken, "mall_orders", "orderNumber", refUpper
                    );
                    if (foundOrderDocId == null) {
                        foundOrderDocId = queryDocIdByField(
                            projectId, databaseId, apiKey, idToken, "mall_orders", "collectionCode", refUpper
                        );
                    }
                    if (foundOrderDocId != null) {
                        JSONObject orderDoc = getFirestoreDoc(
                            projectId, databaseId, apiKey, idToken, "mall_orders/" + urlEncode(foundOrderDocId)
                        );
                        if (orderDoc != null && !isMallOrderAlreadyPaid(orderDoc)) {
                            confirmedOrderOrTicket = markMallOrderPaidInFirestore(
                                projectId, databaseId, apiKey, idToken, foundOrderDocId, refUpper, finalBody, isoNow
                            );
                        }
                    }
                }

                // 4. Persist live payment telemetry so Admin Live Payments reflects immediately
                SharedPreferences.Editor editor = appCtx
                    .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit();
                editor.putString("lastPaymentSmsText", finalBody);
                editor.putString("lastPaymentSmsSender", finalSender);
                editor.putString("lastPaymentSmsAt", isoNow);
                if (confirmedOrderOrTicket) {
                    editor.putString("lastConfirmedReference", confirmedRef);
                }
                editor.apply();

                updatePayshapTelemetryInFirestore(
                    projectId,
                    databaseId,
                    apiKey,
                    idToken,
                    finalBody,
                    finalSender,
                    isoNow,
                    confirmedOrderOrTicket ? confirmedRef : null
                );

                if (confirmedOrderOrTicket) {
                    showBackgroundNotification(
                        appCtx,
                        "Payment Confirmed (" + confirmedRef + ")",
                        "Marked PAID automatically from " + matchedBankWord + " SMS."
                    );
                }
            } catch (Exception ignored) {
            } finally {
                if (pendingResult != null) {
                    pendingResult.finish();
                }
            }
        });
    }

    public static String findMatchingBankKeyword(String haystack, String bankMessageSetting) {
        if (haystack == null || bankMessageSetting == null) return null;
        String lowerHaystack = haystack.toLowerCase(Locale.ROOT);
        String[] parts = bankMessageSetting.split("[,\\n]+");
        for (String raw : parts) {
            String term = raw.trim();
            if (!term.isEmpty() && lowerHaystack.contains(term.toLowerCase(Locale.ROOT))) {
                return term;
            }
        }
        return null;
    }

    public static String extractOrderReference(String smsBody, String referenceFormat) {
        if (smsBody == null || referenceFormat == null) return null;
        String cleanPrefix = referenceFormat.trim();
        if (cleanPrefix.isEmpty()) return null;

        String escaped = Pattern.quote(cleanPrefix);
        Pattern p = Pattern.compile("(?:^|[^A-Za-z0-9])(" + escaped + "[A-Za-z0-9_-]+)", Pattern.CASE_INSENSITIVE);
        Matcher m = p.matcher(smsBody);
        if (m.find()) {
            return m.group(1).trim();
        }
        return null;
    }

    private static String formatIsoUtc(long millis) {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        return sdf.format(new Date(millis > 0 ? millis : System.currentTimeMillis()));
    }

    private static String urlEncode(String s) {
        try {
            return URLEncoder.encode(s, "UTF-8").replace("+", "%20");
        } catch (Exception e) {
            return s;
        }
    }

    private static String buildDocUrl(String projectId, String databaseId, String apiKey, String path, String queryParams) {
        String db = (databaseId == null || databaseId.trim().isEmpty()) ? "(default)" : databaseId.trim();
        StringBuilder sb = new StringBuilder();
        sb.append("https://firestore.googleapis.com/v1/projects/")
          .append(urlEncode(projectId.trim()))
          .append("/databases/")
          .append(urlEncode(db))
          .append("/documents");
        if (path != null && !path.isEmpty()) {
            if (!path.startsWith("/") && !path.startsWith(":")) sb.append("/");
            sb.append(path);
        }
        String sep = "?";
        if (queryParams != null && !queryParams.isEmpty()) {
            sb.append(sep).append(queryParams);
            sep = "&";
        }
        if (apiKey != null && !apiKey.trim().isEmpty()) {
            sb.append(sep).append("key=").append(urlEncode(apiKey.trim()));
        }
        return sb.toString();
    }

    private static String refreshIdToken(String apiKey, String refreshToken) {
        if (apiKey == null || apiKey.trim().isEmpty() || refreshToken == null || refreshToken.trim().isEmpty()) {
            return null;
        }
        HttpURLConnection conn = null;
        try {
            URL url = new URL("https://securetoken.googleapis.com/v1/token?key=" + urlEncode(apiKey.trim()));
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            String body = "grant_type=refresh_token&refresh_token=" + urlEncode(refreshToken.trim());
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }
            if (conn.getResponseCode() == 200) {
                String resp = readAll(conn.getInputStream());
                JSONObject json = new JSONObject(resp);
                return json.optString("id_token", null);
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    private static JSONObject getFirestoreDoc(
        String projectId, String databaseId, String apiKey, String idToken, String docPath
    ) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(buildDocUrl(projectId, databaseId, apiKey, docPath, null));
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            if (idToken != null && !idToken.isEmpty()) {
                conn.setRequestProperty("Authorization", "Bearer " + idToken);
            }
            if (conn.getResponseCode() == 200) {
                return new JSONObject(readAll(conn.getInputStream()));
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    private static String queryDocIdByField(
        String projectId,
        String databaseId,
        String apiKey,
        String idToken,
        String collectionId,
        String fieldPath,
        String value
    ) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(buildDocUrl(projectId, databaseId, apiKey, ":runQuery", null));
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            if (idToken != null && !idToken.isEmpty()) {
                conn.setRequestProperty("Authorization", "Bearer " + idToken);
            }

            JSONObject payload = new JSONObject()
                .put("structuredQuery", new JSONObject()
                    .put("from", new JSONArray().put(new JSONObject().put("collectionId", collectionId)))
                    .put("where", new JSONObject()
                        .put("fieldFilter", new JSONObject()
                            .put("field", new JSONObject().put("fieldPath", fieldPath))
                            .put("op", "EQUAL")
                            .put("value", new JSONObject().put("stringValue", value))))
                    .put("limit", 1));

            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload.toString().getBytes(StandardCharsets.UTF_8));
            }
            if (conn.getResponseCode() == 200) {
                JSONArray arr = new JSONArray(readAll(conn.getInputStream()));
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject item = arr.optJSONObject(i);
                    if (item != null && item.has("document")) {
                        String fullName = item.getJSONObject("document").optString("name", "");
                        int slash = fullName.lastIndexOf('/');
                        if (slash >= 0 && slash + 1 < fullName.length()) {
                            return fullName.substring(slash + 1);
                        }
                    }
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    private static boolean isDocAlreadyPaid(JSONObject docJson) {
        JSONObject fields = docJson.optJSONObject("fields");
        if (fields == null) return false;
        JSONObject ps = fields.optJSONObject("paymentStatus");
        String statusVal = ps != null ? ps.optString("stringValue", "") : "";
        return "PAID".equalsIgnoreCase(statusVal) || "VERIFIED".equalsIgnoreCase(statusVal);
    }

    private static boolean isMallOrderAlreadyPaid(JSONObject docJson) {
        if (isDocAlreadyPaid(docJson)) return true;
        JSONObject fields = docJson.optJSONObject("fields");
        if (fields == null) return false;
        JSONObject st = fields.optJSONObject("status");
        String statusVal = st != null ? st.optString("stringValue", "") : "";
        return "paid".equalsIgnoreCase(statusVal)
            || "collected".equalsIgnoreCase(statusVal)
            || "delivered".equalsIgnoreCase(statusVal);
    }

    private static boolean markTicketPaidInFirestore(
        String projectId,
        String databaseId,
        String apiKey,
        String idToken,
        String docId,
        String refText,
        String smsBody,
        String isoNow
    ) {
        try {
            JSONObject fields = new JSONObject()
                .put("paymentStatus", new JSONObject().put("stringValue", "PAID"))
                .put("paidAt", new JSONObject().put("stringValue", isoNow))
                .put("payshapReference", new JSONObject().put("stringValue", refText))
                .put("verifiedSmsText", new JSONObject().put("stringValue", smsBody));
            String mask = "updateMask.fieldPaths=paymentStatus&updateMask.fieldPaths=paidAt&updateMask.fieldPaths=payshapReference&updateMask.fieldPaths=verifiedSmsText";
            return patchFirestoreDoc(projectId, databaseId, apiKey, idToken, "tickets/" + urlEncode(docId), mask, fields);
        } catch (Exception e) {
            return false;
        }
    }

    private static boolean markMallOrderPaidInFirestore(
        String projectId,
        String databaseId,
        String apiKey,
        String idToken,
        String docId,
        String refText,
        String smsBody,
        String isoNow
    ) {
        try {
            JSONObject fields = new JSONObject()
                .put("status", new JSONObject().put("stringValue", "paid"))
                .put("paymentStatus", new JSONObject().put("stringValue", "PAID"))
                .put("paidAt", new JSONObject().put("stringValue", isoNow))
                .put("payshapReference", new JSONObject().put("stringValue", refText))
                .put("verifiedSmsText", new JSONObject().put("stringValue", smsBody));
            String mask = "updateMask.fieldPaths=status&updateMask.fieldPaths=paymentStatus&updateMask.fieldPaths=paidAt&updateMask.fieldPaths=payshapReference&updateMask.fieldPaths=verifiedSmsText";
            return patchFirestoreDoc(projectId, databaseId, apiKey, idToken, "mall_orders/" + urlEncode(docId), mask, fields);
        } catch (Exception e) {
            return false;
        }
    }

    private static void updatePayshapTelemetryInFirestore(
        String projectId,
        String databaseId,
        String apiKey,
        String idToken,
        String smsBody,
        String sender,
        String isoNow,
        String confirmedRef
    ) {
        try {
            JSONObject fields = new JSONObject()
                .put("lastPaymentSmsText", new JSONObject().put("stringValue", smsBody))
                .put("lastPaymentSmsSender", new JSONObject().put("stringValue", sender))
                .put("lastPaymentSmsAt", new JSONObject().put("stringValue", isoNow))
                .put("updatedAt", new JSONObject().put("stringValue", isoNow));
            StringBuilder mask = new StringBuilder(
                "updateMask.fieldPaths=lastPaymentSmsText&updateMask.fieldPaths=lastPaymentSmsSender&updateMask.fieldPaths=lastPaymentSmsAt&updateMask.fieldPaths=updatedAt"
            );
            if (confirmedRef != null && !confirmedRef.isEmpty()) {
                fields.put("lastConfirmedReference", new JSONObject().put("stringValue", confirmedRef));
                mask.append("&updateMask.fieldPaths=lastConfirmedReference");
            }
            patchFirestoreDoc(projectId, databaseId, apiKey, idToken, "settings/payshap", mask.toString(), fields);
        } catch (Exception ignored) {
        }
    }

    private static boolean patchFirestoreDoc(
        String projectId,
        String databaseId,
        String apiKey,
        String idToken,
        String docPath,
        String maskQuery,
        JSONObject fields
    ) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(buildDocUrl(projectId, databaseId, apiKey, docPath, maskQuery));
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("X-HTTP-Method-Override", "PATCH");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            if (idToken != null && !idToken.isEmpty()) {
                conn.setRequestProperty("Authorization", "Bearer " + idToken);
            }
            JSONObject bodyJson = new JSONObject().put("fields", fields);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bodyJson.toString().getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            return code >= 200 && code < 300;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String readAll(InputStream is) {
        if (is == null) return "";
        try (BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line);
            }
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private static void showBackgroundNotification(Context ctx, String title, String message) {
        try {
            if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(ctx, "android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                return;
            }
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Live Payment Confirmations",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.enableVibration(true);
                nm.createNotificationChannel(channel);
            }

            Intent launchIntent = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
            PendingIntent contentIntent = null;
            if (launchIntent != null) {
                contentIntent = PendingIntent.getActivity(
                    ctx,
                    1001,
                    launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
            }

            NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_notify_chat)
                .setContentTitle(title)
                .setContentText(message)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true);

            if (contentIntent != null) {
                builder.setContentIntent(contentIntent);
            }

            nm.notify((int) (System.currentTimeMillis() % 100000), builder.build());
        } catch (Exception ignored) {
        }
    }
}
