package com.universalband.mall;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Map;
import java.util.concurrent.Executor;

@CapacitorPlugin(name = "NativePermissions")
public class NativePermissionsPlugin extends Plugin {

    private BroadcastReceiver smsReceiver = null;

    private String[] resolvePermissionsForType(String type) {
        if (type == null) return new String[0];
        switch (type) {
            case "camera":
                return new String[] { Manifest.permission.CAMERA };
            case "microphone":
                return new String[] { Manifest.permission.RECORD_AUDIO };
            case "photos":
                if (Build.VERSION.SDK_INT >= 33) {
                    return new String[] {
                        "android.permission.READ_MEDIA_IMAGES",
                        "android.permission.READ_MEDIA_VIDEO"
                    };
                }
                return new String[] { Manifest.permission.READ_EXTERNAL_STORAGE };
            case "files":
                if (Build.VERSION.SDK_INT >= 33) {
                    return new String[] {
                        "android.permission.READ_MEDIA_IMAGES",
                        "android.permission.READ_MEDIA_VIDEO",
                        "android.permission.READ_MEDIA_AUDIO"
                    };
                }
                return new String[] { Manifest.permission.READ_EXTERNAL_STORAGE };
            case "contacts":
                return new String[] { Manifest.permission.READ_CONTACTS };
            case "location":
                return new String[] {
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                };
            case "bluetooth":
                if (Build.VERSION.SDK_INT >= 31) {
                    return new String[] {
                        "android.permission.BLUETOOTH_SCAN",
                        "android.permission.BLUETOOTH_CONNECT"
                    };
                }
                return new String[] {
                    Manifest.permission.BLUETOOTH,
                    Manifest.permission.ACCESS_FINE_LOCATION
                };
            case "notifications":
                if (Build.VERSION.SDK_INT >= 33) {
                    return new String[] { "android.permission.POST_NOTIFICATIONS" };
                }
                return new String[0];
            case "sms":
                return new String[] {
                    Manifest.permission.READ_SMS,
                    Manifest.permission.RECEIVE_SMS
                };
            case "phoneState":
                return new String[] { Manifest.permission.READ_PHONE_STATE };
            default:
                return new String[0];
        }
    }

    private boolean isTypeGranted(String type, String[] perms) {
        if ("notifications".equals(type) && Build.VERSION.SDK_INT < 33) {
            return NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        }
        if (perms.length == 0) return false;

        if ("location".equals(type)) {
            for (String p : perms) {
                if (ContextCompat.checkSelfPermission(getContext(), p) == PackageManager.PERMISSION_GRANTED) {
                    return true;
                }
            }
            return false;
        }

        if (("photos".equals(type) || "files".equals(type)) && Build.VERSION.SDK_INT >= 33) {
            boolean imagesGranted = ContextCompat.checkSelfPermission(
                getContext(),
                "android.permission.READ_MEDIA_IMAGES"
            ) == PackageManager.PERMISSION_GRANTED;
            boolean videoGranted = ContextCompat.checkSelfPermission(
                getContext(),
                "android.permission.READ_MEDIA_VIDEO"
            ) == PackageManager.PERMISSION_GRANTED;
            boolean audioGranted = ContextCompat.checkSelfPermission(
                getContext(),
                "android.permission.READ_MEDIA_AUDIO"
            ) == PackageManager.PERMISSION_GRANTED;
            boolean limitedGranted = Build.VERSION.SDK_INT >= 34 && ContextCompat.checkSelfPermission(
                getContext(),
                "android.permission.READ_MEDIA_VISUAL_USER_SELECTED"
            ) == PackageManager.PERMISSION_GRANTED;

            if ("photos".equals(type)) {
                return imagesGranted || videoGranted || limitedGranted;
            }
            return (imagesGranted && videoGranted && audioGranted) || limitedGranted || audioGranted;
        }

        for (String p : perms) {
            if (ContextCompat.checkSelfPermission(getContext(), p) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        String type = call.getString("type", "");
        String[] perms = resolvePermissionsForType(type);
        boolean granted = isTypeGranted(type, perms);
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        ret.put("status", granted ? "granted" : "denied");
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        String type = call.getString("type", "");
        String[] perms = resolvePermissionsForType(type);

        if ("notifications".equals(type) && Build.VERSION.SDK_INT < 33) {
            boolean enabled = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
            JSObject ret = new JSObject();
            ret.put("granted", enabled);
            ret.put("status", enabled ? "granted" : "denied");
            call.resolve(ret);
            return;
        }

        if (perms.length == 0) {
            JSObject ret = new JSObject();
            ret.put("granted", false);
            ret.put("status", "denied");
            call.resolve(ret);
            return;
        }

        if (isTypeGranted(type, perms)) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            ret.put("status", "granted");
            call.resolve(ret);
            return;
        }

        if (!(getActivity() instanceof MainActivity)) {
            call.reject("MainActivity unavailable for runtime permission request.");
            return;
        }

        MainActivity mainActivity = (MainActivity) getActivity();
        mainActivity.launchPermissionsRequest(perms, (Map<String, Boolean> results) -> {
            boolean granted = isTypeGranted(type, perms);
            JSObject ret = new JSObject();
            ret.put("granted", granted);
            ret.put("status", granted ? "granted" : "denied");
            call.resolve(ret);
        });
    }

    /**
     * Reads REAL incoming SMS messages from Android's SMS Inbox (content://sms/inbox).
     * Requires android.permission.READ_SMS to be granted at runtime.
     */
    @PluginMethod
    public void readSmsInbox(PluginCall call) {
        boolean readGranted = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.READ_SMS
        ) == PackageManager.PERMISSION_GRANTED;

        JSObject ret = new JSObject();
        if (!readGranted) {
            ret.put("granted", false);
            ret.put("messages", new JSArray());
            call.resolve(ret);
            return;
        }

        int limit = call.getInt("limit", 50);
        if (limit <= 0 || limit > 200) limit = 50;
        long sinceMs = call.getLong("sinceMs", 0L);

        JSArray messagesArray = new JSArray();
        Uri inboxUri = Uri.parse("content://sms/inbox");
        String[] projection = new String[] { "_id", "address", "body", "date" };
        String selection = sinceMs > 0 ? "date >= ?" : null;
        String[] selectionArgs = sinceMs > 0 ? new String[] { String.valueOf(sinceMs) } : null;

        try (Cursor cursor = getContext().getContentResolver().query(
            inboxUri,
            projection,
            selection,
            selectionArgs,
            "date DESC"
        )) {
            if (cursor != null) {
                int idIdx = cursor.getColumnIndex("_id");
                int addressIdx = cursor.getColumnIndex("address");
                int bodyIdx = cursor.getColumnIndex("body");
                int dateIdx = cursor.getColumnIndex("date");

                int count = 0;
                while (cursor.moveToNext() && count < limit) {
                    String id = idIdx >= 0 ? cursor.getString(idIdx) : "";
                    String sender = addressIdx >= 0 ? cursor.getString(addressIdx) : "";
                    String body = bodyIdx >= 0 ? cursor.getString(bodyIdx) : "";
                    long dateMs = dateIdx >= 0 ? cursor.getLong(dateIdx) : 0L;

                    JSObject item = new JSObject();
                    item.put("id", id != null ? id : "");
                    item.put("sender", sender != null ? sender : "");
                    item.put("body", body != null ? body : "");
                    item.put("dateMs", dateMs);
                    messagesArray.put(item);
                    count++;
                }
            }
        } catch (Exception e) {
            call.reject("Failed to read Android SMS inbox: " + e.getMessage());
            return;
        }

        ret.put("granted", true);
        ret.put("messages", messagesArray);
        call.resolve(ret);
    }

    /**
     * Persists Admin's LIVE Payment Confirmation configuration into native SharedPreferences
     * so background SmsPaymentReceiver works even when the app is closed or swiped away.
     */
    @PluginMethod
    public void configureBackgroundSmsConfirmation(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        boolean isAdminDevice = call.getBoolean("isAdminDevice", false);
        String bankMessage = call.getString("bankMessage", "TymeBank");
        String referenceFormat = call.getString("referenceFormat", "UB-");
        String projectId = call.getString("projectId", "");
        String databaseId = call.getString("databaseId", "(default)");
        String apiKey = call.getString("apiKey", "");
        String refreshToken = call.getString("refreshToken", "");

        SharedPreferences prefs = getContext()
            .getApplicationContext()
            .getSharedPreferences(SmsPaymentReceiver.PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putBoolean("enabled", enabled);
        editor.putBoolean("isAdminDevice", isAdminDevice);
        editor.putString("bankMessage", (bankMessage != null && !bankMessage.trim().isEmpty()) ? bankMessage.trim() : "TymeBank");
        editor.putString("referenceFormat", (referenceFormat != null && !referenceFormat.trim().isEmpty()) ? referenceFormat.trim() : "UB-");
        if (projectId != null && !projectId.trim().isEmpty()) {
            editor.putString("projectId", projectId.trim());
        }
        if (databaseId != null && !databaseId.trim().isEmpty()) {
            editor.putString("databaseId", databaseId.trim());
        }
        if (apiKey != null && !apiKey.trim().isEmpty()) {
            editor.putString("apiKey", apiKey.trim());
        }
        if (refreshToken != null) {
            editor.putString("refreshToken", refreshToken.trim());
        }
        editor.apply();

        JSObject ret = new JSObject();
        ret.put("saved", true);
        call.resolve(ret);
    }

    /**
     * Returns current Android SMS permission status and any telemetry captured while app was in background.
     */
    @PluginMethod
    public void getBackgroundSmsState(PluginCall call) {
        boolean readGranted = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.READ_SMS
        ) == PackageManager.PERMISSION_GRANTED;
        boolean receiveGranted = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.RECEIVE_SMS
        ) == PackageManager.PERMISSION_GRANTED;

        SharedPreferences prefs = getContext()
            .getApplicationContext()
            .getSharedPreferences(SmsPaymentReceiver.PREFS_NAME, Context.MODE_PRIVATE);

        JSObject ret = new JSObject();
        ret.put("smsGranted", readGranted && receiveGranted);
        ret.put("readSmsGranted", readGranted);
        ret.put("receiveSmsGranted", receiveGranted);
        ret.put("enabled", prefs.getBoolean("enabled", true));
        ret.put("isAdminDevice", prefs.getBoolean("isAdminDevice", false));
        ret.put("bankMessage", prefs.getString("bankMessage", "TymeBank"));
        ret.put("referenceFormat", prefs.getString("referenceFormat", "UB-"));
        ret.put("lastPaymentSmsText", prefs.getString("lastPaymentSmsText", ""));
        ret.put("lastPaymentSmsSender", prefs.getString("lastPaymentSmsSender", ""));
        ret.put("lastPaymentSmsAt", prefs.getString("lastPaymentSmsAt", ""));
        ret.put("lastConfirmedReference", prefs.getString("lastConfirmedReference", ""));
        call.resolve(ret);
    }

    /**
     * Starts a real-time Android BroadcastReceiver for android.provider.Telephony.SMS_RECEIVED.
     * Emits Capacitor "smsReceived" events whenever a real SMS arrives on the phone.
     */
    @PluginMethod
    public void startSmsListener(PluginCall call) {
        boolean receiveGranted = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.RECEIVE_SMS
        ) == PackageManager.PERMISSION_GRANTED;
        boolean readGranted = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.READ_SMS
        ) == PackageManager.PERMISSION_GRANTED;

        JSObject ret = new JSObject();
        if (!receiveGranted && !readGranted) {
            ret.put("listening", false);
            ret.put("granted", false);
            call.resolve(ret);
            return;
        }

        if (smsReceiver == null) {
            smsReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) {
                        return;
                    }
                    try {
                        SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
                        if (messages == null || messages.length == 0) return;

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

                        JSObject payload = new JSObject();
                        payload.put("id", "live_" + timestamp + "_" + sender);
                        payload.put("sender", sender);
                        payload.put("body", bodyBuilder.toString());
                        payload.put("dateMs", timestamp);
                        notifyListeners("smsReceived", payload);
                    } catch (Exception ignored) {
                    }
                }
            };

            IntentFilter filter = new IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION);
            filter.setPriority(999);
            ContextCompat.registerReceiver(
                getContext().getApplicationContext(),
                smsReceiver,
                filter,
                ContextCompat.RECEIVER_EXPORTED
            );
        }

        ret.put("listening", true);
        ret.put("granted", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopSmsListener(PluginCall call) {
        unregisterSmsReceiverSafely();
        JSObject ret = new JSObject();
        ret.put("listening", false);
        call.resolve(ret);
    }

    private void unregisterSmsReceiverSafely() {
        if (smsReceiver != null) {
            try {
                getContext().getApplicationContext().unregisterReceiver(smsReceiver);
            } catch (Exception ignored) {
            }
            smsReceiver = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        unregisterSmsReceiverSafely();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void checkBiometricAvailability(PluginCall call) {
        BiometricManager biometricManager = BiometricManager.from(getContext());
        int authenticators =
            BiometricManager.Authenticators.BIOMETRIC_STRONG |
            BiometricManager.Authenticators.BIOMETRIC_WEAK;
        int status = biometricManager.canAuthenticate(authenticators);

        boolean available = status == BiometricManager.BIOMETRIC_SUCCESS;
        boolean hasHardware =
            status != BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE &&
            status != BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED;
        boolean hasEnrolled = status == BiometricManager.BIOMETRIC_SUCCESS;

        String message;
        if (available) {
            message = "Hardware fingerprint sensor ready.";
        } else if (status == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
            message = "No fingerprint set up on this phone. Add a fingerprint in Android Settings > Security.";
        } else if (status == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE) {
            message = "This phone does not have biometric fingerprint hardware.";
        } else if (status == BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE) {
            message = "Biometric fingerprint sensor is currently unavailable. Try again.";
        } else {
            message = "No fingerprint set up or biometric sensor unavailable on this phone.";
        }

        JSObject ret = new JSObject();
        ret.put("available", available);
        ret.put("hasHardware", hasHardware);
        ret.put("hasEnrolled", hasEnrolled);
        ret.put("statusCode", status);
        ret.put("message", message);
        call.resolve(ret);
    }

    @PluginMethod
    public void authenticateBiometric(PluginCall call) {
        if (!(getActivity() instanceof FragmentActivity)) {
            JSObject ret = new JSObject();
            ret.put("authenticated", false);
            ret.put("errorMessage", "Biometric prompt requires an Android FragmentActivity.");
            call.resolve(ret);
            return;
        }

        final String title = call.getString("title", "Unlock Universal Band with fingerprint");
        final String subtitle = call.getString("subtitle", "Universal Band Security");
        final String description = call.getString("description", "Touch your fingerprint sensor to authenticate.");
        final FragmentActivity activity = (FragmentActivity) getActivity();

        activity.runOnUiThread(() -> {
            try {
                BiometricManager biometricManager = BiometricManager.from(activity);
                int authenticators =
                    BiometricManager.Authenticators.BIOMETRIC_STRONG |
                    BiometricManager.Authenticators.BIOMETRIC_WEAK;
                int status = biometricManager.canAuthenticate(authenticators);
                if (status != BiometricManager.BIOMETRIC_SUCCESS) {
                    JSObject ret = new JSObject();
                    ret.put("authenticated", false);
                    ret.put("errorCode", status);
                    ret.put(
                        "errorMessage",
                        status == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED
                            ? "No fingerprint set up on this phone. Please add one in Android Settings > Security."
                            : "No fingerprint hardware available on this device."
                    );
                    call.resolve(ret);
                    return;
                }

                Executor executor = ContextCompat.getMainExecutor(activity);
                final boolean[] completed = new boolean[] { false };

                BiometricPrompt biometricPrompt = new BiometricPrompt(
                    activity,
                    executor,
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                            super.onAuthenticationError(errorCode, errString);
                            if (completed[0]) return;
                            completed[0] = true;
                            JSObject ret = new JSObject();
                            ret.put("authenticated", false);
                            ret.put("errorCode", errorCode);
                            ret.put("errorMessage", String.valueOf(errString));
                            call.resolve(ret);
                        }

                        @Override
                        public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                            super.onAuthenticationSucceeded(result);
                            if (completed[0]) return;
                            completed[0] = true;
                            JSObject ret = new JSObject();
                            ret.put("authenticated", true);
                            ret.put("message", "Hardware fingerprint verified!");
                            call.resolve(ret);
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            super.onAuthenticationFailed();
                        }
                    }
                );

                BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setSubtitle(subtitle)
                    .setDescription(description)
                    .setNegativeButtonText("Cancel")
                    .setAllowedAuthenticators(authenticators)
                    .build();

                biometricPrompt.authenticate(promptInfo);
            } catch (Exception e) {
                JSObject ret = new JSObject();
                ret.put("authenticated", false);
                ret.put("errorMessage", "Could not open fingerprint scanner: " + e.getMessage());
                call.resolve(ret);
            }
        });
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            Uri uri = Uri.fromParts("package", getActivity().getPackageName(), null);
            intent.setData(uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not open Android App Settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void pickContact(PluginCall call) {
        String[] perms = resolvePermissionsForType("contacts");
        if (!isTypeGranted("contacts", perms)) {
            JSObject ret = new JSObject();
            ret.put("granted", false);
            ret.put("cancelled", false);
            call.resolve(ret);
            return;
        }

        if (!(getActivity() instanceof MainActivity)) {
            call.reject("MainActivity unavailable for contact picker.");
            return;
        }

        MainActivity mainActivity = (MainActivity) getActivity();
        Intent pickIntent = new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
        mainActivity.launchContactPicker(pickIntent, (Intent data) -> {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            if (data == null || data.getData() == null) {
                ret.put("cancelled", true);
                call.resolve(ret);
                return;
            }
            Uri contactUri = data.getData();
            String[] projection = new String[] {
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
            };
            try (Cursor cursor = getContext().getContentResolver().query(contactUri, projection, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int nameIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                    int phoneIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                    String name = nameIdx >= 0 ? cursor.getString(nameIdx) : "";
                    String phone = phoneIdx >= 0 ? cursor.getString(phoneIdx) : "";
                    ret.put("cancelled", false);
                    ret.put("name", name != null ? name : "");
                    ret.put("phone", phone != null ? phone : "");
                    call.resolve(ret);
                    return;
                }
            } catch (Exception e) {
                call.reject("Failed to read selected contact: " + e.getMessage());
                return;
            }
            ret.put("cancelled", true);
            call.resolve(ret);
        });
    }
}
