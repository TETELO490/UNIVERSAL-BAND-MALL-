package com.universalband.mall;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.provider.Telephony;
import android.telephony.SmsMessage;
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
import org.json.JSONObject;

/**
 * Background Android BroadcastReceiver that listens for REAL incoming GoTyme / TymeBank payment SMS.
 *
 * CRITICAL REQUIREMENTS:
 * 1. REAL SMS LISTENER in background (even when app is closed / killed).
 * 2. Triggers ONLY when SMS is from GoTyme Bank / TymeBank AND contains "You received" and "from".
 * 3. Triggers for ANY amount (R1, R5, R10, R20, R50, R100, R500, R1000, ANY amount).
 * 4. Starts LOUD LOOPING ALARM SONG via PaymentAlarmService (loops until user presses STOP).
 * 5. MANUAL APPROVAL ONLY: Does NOT auto-approve tickets or orders. Ticket stays WAITING FOR PAYMENT.
 */
public class SmsPaymentReceiver extends BroadcastReceiver {

    public static final String PREFS_NAME = "UbLivePaymentPrefs";
    public static final String ACTION_PAYMENT_ALARM_TRIGGERED = "com.universalband.mall.PAYMENT_ALARM_TRIGGERED";
    public static final String ACTION_LIVE_PAYMENT_SMS = "com.universalband.mall.LIVE_PAYMENT_SMS";
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

        // Check if this is a REAL GoTyme / TymeBank incoming payment SMS
        if (!isTymeBankPaymentSms(finalSender, finalBody)) {
            return;
        }

        // Extract REAL amount and REAL sender name from the real SMS (ANY AMOUNT: R1, R5, R50, R100, etc.)
        final String parsedAmount = extractPaymentAmount(finalBody);
        final String parsedCustomer = extractPaymentSender(finalBody);
        final String isoNow = formatIsoUtc(finalTimestamp);

        // 1. Immediately START the LOUD LOOPING ALARM foreground service with persistent Heads-up notification!
        PaymentAlarmService.startAlarm(context.getApplicationContext(), parsedAmount, parsedCustomer, finalBody);

        // 2. Broadcast internal intent to notify in-app Capacitor WebView if app is in foreground
        Intent internalIntent = new Intent(ACTION_PAYMENT_ALARM_TRIGGERED);
        internalIntent.setPackage(context.getPackageName());
        internalIntent.putExtra("id", "live_payment_" + finalTimestamp);
        internalIntent.putExtra("amount", parsedAmount);
        internalIntent.putExtra("customer", parsedCustomer);
        internalIntent.putExtra("sender", finalSender);
        internalIntent.putExtra("body", finalBody);
        internalIntent.putExtra("dateMs", finalTimestamp);
        context.sendBroadcast(internalIntent);

        // Also notify standard SMS listener
        Intent smsIntent = new Intent(ACTION_LIVE_PAYMENT_SMS);
        smsIntent.setPackage(context.getPackageName());
        smsIntent.putExtra("id", "live_" + finalTimestamp);
        smsIntent.putExtra("sender", finalSender);
        smsIntent.putExtra("body", finalBody);
        smsIntent.putExtra("dateMs", finalTimestamp);
        context.sendBroadcast(smsIntent);

        // 3. Persist payment alert telemetry in native SharedPreferences
        final Context appCtx = context.getApplicationContext();
        SharedPreferences.Editor editor = appCtx
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit();
        editor.putString("lastPaymentSmsText", finalBody);
        editor.putString("lastPaymentSmsSender", parsedCustomer.isEmpty() ? finalSender : parsedCustomer);
        editor.putString("lastPaymentAmount", parsedAmount);
        editor.putString("lastPaymentSmsAt", isoNow);
        editor.putBoolean("alarmActive", true);
        editor.apply();

        // 4. Update Firestore telemetry asynchronously (CRITICAL: DO NOT AUTO-APPROVE TICKETS. MANUAL ONLY)
        SharedPreferences prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        final String projectId = prefs.getString("projectId", "");
        final String databaseId = prefs.getString("databaseId", "(default)");
        final String apiKey = prefs.getString("apiKey", "");
        final String refreshToken = prefs.getString("refreshToken", "");

        if (projectId != null && !projectId.trim().isEmpty() && apiKey != null && !apiKey.trim().isEmpty()) {
            final PendingResult pendingResult = goAsync();
            EXECUTOR.execute(() -> {
                try {
                    String idToken = refreshIdToken(apiKey, refreshToken);
                    updatePayshapTelemetryInFirestore(
                        projectId,
                        databaseId,
                        apiKey,
                        idToken,
                        finalBody,
                        parsedCustomer.isEmpty() ? finalSender : parsedCustomer,
                        parsedAmount,
                        isoNow
                    );
                } catch (Exception ignored) {
                } finally {
                    if (pendingResult != null) {
                        pendingResult.finish();
                    }
                }
            });
        }
    }

    /**
     * Checks if SMS is from GoTyme Bank / TymeBank AND contains "You received" and "from".
     * Triggers for ANY amount.
     */
    public static boolean isTymeBankPaymentSms(String sender, String body) {
        if (body == null || body.trim().isEmpty()) return false;
        String haystack = ((sender != null ? sender : "") + " " + body).toLowerCase(Locale.ROOT);

        boolean isTymeBank = haystack.contains("gotyme") ||
                             haystack.contains("tymebank") ||
                             haystack.contains("tyme bank") ||
                             haystack.contains("tyme");

        boolean hasReceived = haystack.contains("you received");
        boolean hasFrom = haystack.contains("from");

        return isTymeBank && hasReceived && hasFrom;
    }

    /**
     * Extracts ANY amount from SMS: e.g. "R1.00", "R1", "R50.00", "R100", "R1,000.00".
     */
    public static String extractPaymentAmount(String body) {
        if (body == null) return "Payment";
        // Pattern 1: "You received R1.00" or "You received R 1.00" or "You received R50"
        Pattern p1 = Pattern.compile("received\\s+([A-Za-z$€£]*\\s*[\\d,.]+)", Pattern.CASE_INSENSITIVE);
        Matcher m1 = p1.matcher(body);
        if (m1.find()) {
            String val = m1.group(1).trim();
            if (!val.isEmpty()) return val;
        }

        // Pattern 2: Fallback search for any "R123.45" or "R123"
        Pattern p2 = Pattern.compile("(R\\s*[\\d,.]+)", Pattern.CASE_INSENSITIVE);
        Matcher m2 = p2.matcher(body);
        if (m2.find()) {
            String val = m2.group(1).trim();
            if (!val.isEmpty()) return val;
        }

        return "Payment";
    }

    /**
     * Extracts REAL sender name from SMS: e.g. "from T. PHOKWANE." -> "T. PHOKWANE".
     */
    public static String extractPaymentSender(String body) {
        if (body == null) return "Customer";
        Pattern p = Pattern.compile("from\\s+([^.]+?)(?:\\.|\\s+Your available|\\s+Your balance|\\s+Ref|\\s+Available|$)", Pattern.CASE_INSENSITIVE);
        Matcher m = p.matcher(body);
        if (m.find()) {
            String name = m.group(1).trim();
            if (!name.isEmpty()) return name;
        }
        return "Customer";
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

    private static void updatePayshapTelemetryInFirestore(
        String projectId,
        String databaseId,
        String apiKey,
        String idToken,
        String smsBody,
        String sender,
        String amount,
        String isoNow
    ) {
        try {
            JSONObject fields = new JSONObject()
                .put("lastPaymentSmsText", new JSONObject().put("stringValue", smsBody))
                .put("lastPaymentSmsSender", new JSONObject().put("stringValue", sender))
                .put("lastPaymentAmount", new JSONObject().put("stringValue", amount))
                .put("lastPaymentSmsAt", new JSONObject().put("stringValue", isoNow))
                .put("alarmActive", new JSONObject().put("booleanValue", true))
                .put("updatedAt", new JSONObject().put("stringValue", isoNow));

            String mask = "updateMask.fieldPaths=lastPaymentSmsText&updateMask.fieldPaths=lastPaymentSmsSender&updateMask.fieldPaths=lastPaymentAmount&updateMask.fieldPaths=lastPaymentSmsAt&updateMask.fieldPaths=alarmActive&updateMask.fieldPaths=updatedAt";
            patchFirestoreDoc(projectId, databaseId, apiKey, idToken, "settings/payshap", mask, fields);
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
}
