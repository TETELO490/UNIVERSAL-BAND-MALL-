package com.universalband.mall;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.BridgeActivity;
import java.util.Map;

public class MainActivity extends BridgeActivity {

    public interface PermissionResultHandler {
        void onResult(Map<String, Boolean> results);
    }

    public interface ContactPickHandler {
        void onResult(Intent data);
    }

    private ActivityResultLauncher<String[]> permissionLauncher;
    private PermissionResultHandler pendingPermissionHandler;

    private ActivityResultLauncher<Intent> contactPickerLauncher;
    private ContactPickHandler pendingContactHandler;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativePermissionsPlugin.class);

        permissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            result -> {
                if (pendingPermissionHandler != null) {
                    PermissionResultHandler handler = pendingPermissionHandler;
                    pendingPermissionHandler = null;
                    handler.onResult(result);
                }
            }
        );

        contactPickerLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            (ActivityResult result) -> {
                if (pendingContactHandler != null) {
                    ContactPickHandler handler = pendingContactHandler;
                    pendingContactHandler = null;
                    if (result.getResultCode() == Activity.RESULT_OK) {
                        handler.onResult(result.getData());
                    } else {
                        handler.onResult(null);
                    }
                }
            }
        );

        super.onCreate(savedInstanceState);
    }

    public void launchPermissionsRequest(String[] permissions, PermissionResultHandler handler) {
        runOnUiThread(() -> {
            pendingPermissionHandler = handler;
            permissionLauncher.launch(permissions);
        });
    }

    public void launchContactPicker(Intent intent, ContactPickHandler handler) {
        runOnUiThread(() -> {
            pendingContactHandler = handler;
            contactPickerLauncher.launch(intent);
        });
    }
}
