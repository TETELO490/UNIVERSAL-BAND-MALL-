package com.universalband.mall;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.io.File;

/**
 * Foreground Service that plays a loud looping alarm when a real GoTyme / TymeBank
 * payment SMS is received. Loops continuously until the user explicitly presses STOP / DISMISS.
 * Supports non-looping single-shot mode for Admin TEST ALARM preview.
 */
public class PaymentAlarmService extends Service {

    public static final String ACTION_START_ALARM = "com.universalband.mall.ACTION_START_ALARM";
    public static final String ACTION_STOP_ALARM = "com.universalband.mall.ACTION_STOP_ALARM";
    public static final String ACTION_PAYMENT_ALARM_STOPPED = "com.universalband.mall.PAYMENT_ALARM_STOPPED";
    public static final String EXTRA_AMOUNT = "extra_amount";
    public static final String EXTRA_SENDER = "extra_sender";
    public static final String EXTRA_SMS_BODY = "extra_sms_body";
    public static final String EXTRA_LOOP = "extra_loop";
    public static final String CHANNEL_ID = "ub_payment_alarm_channel";
    public static final int NOTIFICATION_ID = 90210;

    private static volatile boolean isRinging = false;
    private MediaPlayer mediaPlayer;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable autoStopTestRunnable;

    public static boolean isAlarmActive() {
        return isRinging;
    }

    public static void startAlarm(Context context, String amount, String sender, String smsBody) {
        startAlarm(context, amount, sender, smsBody, true);
    }

    public static void startAlarm(Context context, String amount, String sender, String smsBody, boolean loop) {
        Intent intent = new Intent(context, PaymentAlarmService.class);
        intent.setAction(ACTION_START_ALARM);
        intent.putExtra(EXTRA_AMOUNT, amount);
        intent.putExtra(EXTRA_SENDER, sender);
        intent.putExtra(EXTRA_SMS_BODY, smsBody);
        intent.putExtra(EXTRA_LOOP, loop);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context, intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            try {
                context.startService(intent);
            } catch (Exception ignored) {}
        }
    }

    public static void stopAlarm(Context context) {
        Intent intent = new Intent(context, PaymentAlarmService.class);
        intent.setAction(ACTION_STOP_ALARM);
        try {
            context.startService(intent);
        } catch (Exception ignored) {}
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_STOP_ALARM.equals(action)) {
            markAlarmInactiveInPrefs();
            stopAlarmPlayback();
            broadcastAlarmStopped();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_START_ALARM.equals(action)) {
            String amount = intent.getStringExtra(EXTRA_AMOUNT);
            if (amount == null || amount.trim().isEmpty()) amount = "Payment";
            String sender = intent.getStringExtra(EXTRA_SENDER);
            if (sender == null || sender.trim().isEmpty()) sender = "Customer";
            String smsBody = intent.getStringExtra(EXTRA_SMS_BODY);
            if (smsBody == null) smsBody = "";
            boolean loop = intent.getBooleanExtra(EXTRA_LOOP, true);

            startForegroundAlarm(amount, sender, smsBody, loop);
            startAlarmPlayback(loop);
            return loop ? START_STICKY : START_NOT_STICKY;
        }

        return START_NOT_STICKY;
    }

    private void markAlarmInactiveInPrefs() {
        try {
            getApplicationContext()
                .getSharedPreferences(SmsPaymentReceiver.PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean("alarmActive", false)
                .apply();
        } catch (Exception ignored) {}
    }

    private void broadcastAlarmStopped() {
        try {
            Intent stopped = new Intent(ACTION_PAYMENT_ALARM_STOPPED);
            stopped.setPackage(getPackageName());
            sendBroadcast(stopped);
        } catch (Exception ignored) {}
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Payment Received Alarms",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Loud repeating alarm when incoming GoTyme / TymeBank payments arrive");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 800, 300, 800, 300});
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setBypassDnd(true);

            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private void startForegroundAlarm(String amount, String sender, String smsBody, boolean loop) {
        Intent stopIntent = new Intent(this, PaymentAlarmService.class);
        stopIntent.setAction(ACTION_STOP_ALARM);
        PendingIntent stopPendingIntent = PendingIntent.getService(
            this,
            101,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent openAppIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent openAppPendingIntent = null;
        if (openAppIntent != null) {
            openAppIntent.putExtra("navigate_to", "/admin/live-payments");
            openAppIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            openAppPendingIntent = PendingIntent.getActivity(
                this,
                102,
                openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        }

        String title = loop ? "PAYMENT RECEIVED - Check SMS" : "TEST ALARM - Sound Preview";
        String contentText = loop ? (amount + " from " + sender) : "Playing selected alarm sound once (no fake payment).";
        String bigText = loop
            ? ("PAYMENT RECEIVED!\n" +
               "Amount: " + amount + "\n" +
               "From: " + sender + "\n" +
               "SMS: " + smsBody + "\n" +
               "Tap to open Admin Payment Approval. Manual confirmation required.")
            : "Test alarm sound playing once at your configured volume.";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(contentText)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(bigText))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(loop)
            .setAutoCancel(!loop)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "STOP ALARM", stopPendingIntent);

        if (openAppPendingIntent != null) {
            builder.setContentIntent(openAppPendingIntent);
            if (loop) {
                builder.setFullScreenIntent(openAppPendingIntent, true);
            }
        }

        Notification notification = builder.build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void startAlarmPlayback(boolean loop) {
        if (autoStopTestRunnable != null) {
            handler.removeCallbacks(autoStopTestRunnable);
            autoStopTestRunnable = null;
        }

        isRinging = loop;

        SharedPreferences prefs = getApplicationContext()
            .getSharedPreferences(SmsPaymentReceiver.PREFS_NAME, Context.MODE_PRIVATE);
        float rawVol = prefs.getFloat("alarmVolume", 1.0f);
        final float volume = Math.max(0.2f, Math.min(1.0f, rawVol));
        String alarmMode = prefs.getString("alarmMode", "preset");
        String alarmPreset = prefs.getString("alarmPresetId", "loud-ringtone");
        String customFilePath = prefs.getString("alarmCustomFilePath", "");

        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                int maxVol = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
                int targetStreamVol = Math.max(1, Math.round(maxVol * volume));
                am.setStreamVolume(AudioManager.STREAM_ALARM, targetStreamVol, 0);
            }
        } catch (Exception ignored) {}

        if (loop) {
            try {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null && wakeLock == null) {
                    wakeLock = pm.newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK,
                        "UniversalBand:PaymentAlarmWakeLock"
                    );
                    wakeLock.acquire(10 * 60 * 1000L);
                }
            } catch (Exception ignored) {}
        }

        try {
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                if (loop) {
                    long[] pattern = new long[]{0, 1000, 400, 1000, 400};
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        vibrator.vibrate(VibrationEffect.createWaveform(pattern, 1));
                    } else {
                        vibrator.vibrate(pattern, 1);
                    }
                } else {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        vibrator.vibrate(VibrationEffect.createOneShot(450, VibrationEffect.DEFAULT_AMPLITUDE));
                    } else {
                        vibrator.vibrate(450);
                    }
                }
            }
        } catch (Exception ignored) {}

        try {
            if (mediaPlayer != null) {
                try { mediaPlayer.stop(); mediaPlayer.release(); } catch (Exception ignored) {}
                mediaPlayer = null;
            }

            mediaPlayer = new MediaPlayer();
            boolean customLoaded = false;

            if ("custom".equals(alarmMode) && customFilePath != null && !customFilePath.isEmpty()) {
                File customFile = new File(customFilePath);
                if (customFile.exists() && customFile.canRead() && customFile.length() > 0) {
                    mediaPlayer.setDataSource(customFile.getAbsolutePath());
                    customLoaded = true;
                }
            }

            if (!customLoaded) {
                int ringType = ("marimba-alert".equals(alarmPreset) || "cash-register".equals(alarmPreset))
                    ? RingtoneManager.TYPE_RINGTONE
                    : RingtoneManager.TYPE_ALARM;

                Uri alertUri = RingtoneManager.getDefaultUri(ringType);
                if (alertUri == null) {
                    alertUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                }
                if (alertUri == null) {
                    alertUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                }
                if (alertUri == null) {
                    alertUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                }
                mediaPlayer.setDataSource(this, alertUri);
            }

            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            mediaPlayer.setAudioAttributes(attrs);
            mediaPlayer.setAudioStreamType(AudioManager.STREAM_ALARM);
            mediaPlayer.setLooping(loop);
            mediaPlayer.setVolume(volume, volume);

            mediaPlayer.setOnCompletionListener(mp -> {
                if (!loop) {
                    stopAlarmPlayback();
                    stopForeground(true);
                    stopSelf();
                }
            });

            mediaPlayer.setOnPreparedListener(mp -> {
                try {
                    mp.start();
                } catch (Exception ignored) {}
            });
            mediaPlayer.prepareAsync();

            if (!loop) {
                // Safety cap so single test sound always stops cleanly after 3.5 seconds even for long alarm tones
                autoStopTestRunnable = () -> {
                    stopAlarmPlayback();
                    stopForeground(true);
                    stopSelf();
                };
                handler.postDelayed(autoStopTestRunnable, 3500);
            }
        } catch (Exception e) {
            try {
                Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                if (ringtoneUri != null) {
                    mediaPlayer = MediaPlayer.create(this, ringtoneUri);
                    if (mediaPlayer != null) {
                        mediaPlayer.setLooping(loop);
                        mediaPlayer.setVolume(volume, volume);
                        mediaPlayer.start();
                    }
                }
            } catch (Exception ignored) {}
        }
    }

    private void stopAlarmPlayback() {
        isRinging = false;

        if (autoStopTestRunnable != null) {
            handler.removeCallbacks(autoStopTestRunnable);
            autoStopTestRunnable = null;
        }

        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }

        if (vibrator != null) {
            try {
                vibrator.cancel();
            } catch (Exception ignored) {}
            vibrator = null;
        }

        if (wakeLock != null) {
            try {
                if (wakeLock.isHeld()) {
                    wakeLock.release();
                }
            } catch (Exception ignored) {}
            wakeLock = null;
        }
    }

    @Override
    public void onDestroy() {
        stopAlarmPlayback();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
