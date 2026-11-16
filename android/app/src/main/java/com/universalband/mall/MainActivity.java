package com.universalband.mall;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.BridgeActivity;
import java.util.Map;
import java.util.function.Consumer;

public class MainActivity extends BridgeActivity {

    public static final String ACTION_NOTIFICATION_NAVIGATE = "com.universalband.mall.NOTIFICATION_NAVIGATE";

    private ActivityResultLauncher<String[]> permissionLauncher;
    private Consumer<Map<String, Boolean>> pendingPermissionCallback;

    private ActivityResultLauncher<Intent> contactPickerLauncher;
    private Consumer<Intent> pendingContactCallback;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativePermissionsPlugin.class);

        permissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            results -> {
                Consumer<Map<String, Boolean>> cb = pendingPermissionCallback;
                pendingPermissionCallback = null;
                if (cb != null) {
                    cb.accept(results);
                }
            }
        );

        contactPickerLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                Consumer<Intent> cb = pendingContactCallback;
                pendingContactCallback = null;
                if (cb != null) {
                    cb.accept(result != null ? result.getData() : null);
                }
            }
        );

        super.onCreate(savedInstanceState);
        handleAlarmNavigationIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleAlarmNavigationIntent(intent);
    }

    private void handleAlarmNavigationIntent(Intent intent) {
        if (intent == null) return;
        String navigateTo = intent.getStringExtra("navigate_to");
        if (navigateTo == null || navigateTo.trim().isEmpty()) return;

        String cleanRoute = navigateTo.trim();
        SharedPreferences prefs = getApplicationContext()
            .getSharedPreferences(SmsPaymentReceiver.PREFS_NAME, MODE_PRIVATE);
        prefs.edit().putString("pendingNavigateTo", cleanRoute).apply();

        Intent navIntent = new Intent(ACTION_NOTIFICATION_NAVIGATE);
        navIntent.setPackage(getPackageName());
        navIntent.putExtra("navigate_to", cleanRoute);
        sendBroadcast(navIntent);

        intent.removeExtra("navigate_to");
    }

    public void launchPermissionsRequest(String[] permissions, Consumer<Map<String, Boolean>> callback) {
        if (permissionLauncher == null || permissions == null) {
            if (callback != null) callback.accept(java.util.Collections.emptyMap());
            return;
        }
        pendingPermissionCallback = callback;
        permissionLauncher.launch(permissions);
    }

    public void launchContactPicker(Intent pickIntent, Consumer<Intent> callback) {
        if (contactPickerLauncher == null || pickIntent == null) {
            if (callback != null) callback.accept(null);
            return;
        }
        pendingContactCallback = callback;
        contactPickerLauncher.launch(pickIntent);
    }
}
