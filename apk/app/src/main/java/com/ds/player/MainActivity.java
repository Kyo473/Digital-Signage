package com.ds.player;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {

    private WebView webView;
    private ProgressBar progressBar;
    private TextView errorView;
    private SharedPreferences prefs;

    private View overlayPanel;
    private TextView tvPingStatus;

    private final Handler hideHandler = new Handler(Looper.getMainLooper());
    private final Handler pingHandler = new Handler(Looper.getMainLooper());
    private final Handler screenPollHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private static final int OVERLAY_HIDE_DELAY = 4000;
    private static final int PING_INTERVAL = 10000;
    private static final int SCREEN_POLL_INTERVAL = 5000;
    private static final int SCHEDULE_POLL_INTERVAL = 30000;

    private boolean screenPolling = false;
    private boolean schedulePolling = false;
    private boolean isScheduleActive = true;
    private boolean isScreenSuspended = false;
    // Always poll — to catch screen changes while player is running
    private static final boolean CONTINUOUS_POLL = true;

    private final Handler scheduleHandler = new Handler(Looper.getMainLooper());
    private final Handler tvCommandHandler = new Handler(Looper.getMainLooper());

    private static final int TV_COMMAND_POLL_INTERVAL = 5000;
    private boolean tvCommandPolling = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );

        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences("ds_prefs", MODE_PRIVATE);
        webView = findViewById(R.id.webview);
        progressBar = findViewById(R.id.progress);
        errorView = findViewById(R.id.error_view);
        overlayPanel = findViewById(R.id.overlay_panel);
        tvPingStatus = findViewById(R.id.tv_ping_status);

        findViewById(R.id.btn_reload).setOnClickListener(v -> {
            hideOverlay();
            loadPlayer();
        });
        findViewById(R.id.btn_settings).setOnClickListener(v -> openSettings());
        findViewById(R.id.btn_exit).setOnClickListener(v -> finishAffinity());

        requestWriteSettingsIfNeeded();
        restoreScreenTimeout();
        setupWebView();
        startUp();
        schedulePing();
        startSchedulePoll();
        startTvCommandPoll();
    }

    // ── Startup logic ─────────────────────────────────────────────────────────

    private void startUp() {
        String screenId = prefs.getString("screen_id", "");
        String deviceId = prefs.getString("device_id", "");
        String token = prefs.getString("device_token", "");

        if (deviceId.isEmpty()) {
            openSettings();
            return;
        }

        if (token.isEmpty()) {
            showWaitingForApproval();
            return;
        }

        startScreenPolling(deviceId);

        if (!screenId.isEmpty()) {
            loadPlayer();
        } else {
            showWaitingForScreen();
        }
    }

    private void showWaitingForApproval() {
        progressBar.setVisibility(View.GONE);
        String code = prefs.getString("device_code", "");
        errorView.setText("Ожидание подтверждения устройства...\n\nОткройте веб-интерфейс → Устройства\nи нажмите «Подтвердить» рядом с кодом:\n\n" + code);
        errorView.setVisibility(View.VISIBLE);
        // Keep polling register until approved
        String deviceId = prefs.getString("device_id", "");
        startApprovalPolling(deviceId);
    }

    private final Handler approvalHandler = new Handler(Looper.getMainLooper());
    private boolean approvalPolling = false;

    private void startApprovalPolling(String deviceId) {
        if (approvalPolling) return;
        approvalPolling = true;
        scheduleApprovalPoll(deviceId);
    }

    private void scheduleApprovalPoll(String deviceId) {
        approvalHandler.postDelayed(() -> doApprovalPoll(deviceId), 5000);
    }

    private void doApprovalPoll(String deviceId) {
        if (!approvalPolling) return;
        String serverUrl = getServerUrl();
        String deviceCode = prefs.getString("device_code", "");
        executor.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("code", deviceCode);
                java.net.URL url = new java.net.URL(serverUrl + "/api/devices/register");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body.toString().getBytes("UTF-8"));
                }
                int code = conn.getResponseCode();
                StringBuilder resp = new StringBuilder();
                try (BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
                    String line;
                    while ((line = br.readLine()) != null) resp.append(line);
                }
                conn.disconnect();

                if (code == 200) {
                    JSONObject json = new JSONObject(resp.toString());
                    boolean approved = json.optBoolean("approved", false);
                    String token = approved ? json.optString("token", "") : "";
                    if (approved && !token.isEmpty()) {
                        prefs.edit().putString("device_token", token).commit(); // commit() синхронный — гарантирует запись до screenPoll
                        approvalPolling = false;
                        screenHandler.post(() -> {
                            errorView.setVisibility(View.GONE);
                            startScreenPolling(deviceId);
                            showWaitingForScreen();
                        });
                    } else {
                        screenHandler.post(() -> scheduleApprovalPoll(deviceId));
                    }
                } else {
                    screenHandler.post(() -> scheduleApprovalPoll(deviceId));
                }
            } catch (Exception e) {
                screenHandler.post(() -> scheduleApprovalPoll(deviceId));
            }
        });
    }

    private void showWaitingForScreen() {
        progressBar.setVisibility(View.GONE);
        errorView.setText("Ожидание назначения экрана...\n\nОткройте веб-интерфейс → Устройства\nи назначьте экран этому устройству.");
        errorView.setVisibility(View.VISIBLE);
    }

    // ── Screen polling (waiting for admin to assign screen) ───────────────────

    private void startScreenPolling(String deviceId) {
        if (screenPolling) return;
        screenPolling = true;
        scheduleScreenPoll(deviceId);
    }

    private void scheduleScreenPoll(String deviceId) {
        screenPollHandler.postDelayed(() -> doScreenPoll(deviceId), SCREEN_POLL_INTERVAL);
    }

    private String getDeviceToken() {
        return prefs.getString("device_token", "");
    }

    private void doScreenPoll(String deviceId) {
        if (!screenPolling) return;
        String serverUrl = getServerUrl();
        String token = getDeviceToken();
        executor.execute(() -> {
            try {
                URL url = new URL(serverUrl + "/api/devices/" + deviceId + "/screen?token=" + token);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                int code = conn.getResponseCode();

                if (code == 401 || code == 403) {
                    // Token invalid or revoked — clear token and re-enter approval polling.
                    // This also covers the race where screenPoll fires before approvalPoll saves the token.
                    screenHandler.post(() -> {
                        screenPolling = false;
                        approvalPolling = false;
                        prefs.edit().putString("device_token", "").putString("screen_id", "").apply();
                        showWaitingForApproval();
                    });
                    return;
                }

                StringBuilder resp = new StringBuilder();
                try (BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
                    String line;
                    while ((line = br.readLine()) != null) resp.append(line);
                }
                conn.disconnect();

                if (code == 200) {
                    JSONObject json = new JSONObject(resp.toString());
                    String newScreenId = json.optString("screen_id", "");
                    screenHandler.post(() -> {
                        String currentScreenId = prefs.getString("screen_id", "");
                        boolean hasScreen = !newScreenId.isEmpty() && !newScreenId.equals("null");

                        if (hasScreen && !newScreenId.equals(currentScreenId)) {
                            prefs.edit().putString("screen_id", newScreenId).apply();
                            errorView.setVisibility(View.GONE);
                            loadPlayer();
                        } else if (!hasScreen && !currentScreenId.isEmpty()) {
                            prefs.edit().putString("screen_id", "").apply();
                            showWaitingForScreen();
                        }
                        scheduleScreenPoll(deviceId);
                    });
                } else {
                    screenHandler.post(() -> scheduleScreenPoll(deviceId));
                }
            } catch (IOException e) {
                screenHandler.post(() -> scheduleScreenPoll(deviceId));
            } catch (Exception e) {
                screenHandler.post(() -> scheduleScreenPoll(deviceId));
            }
        });
    }

    private final Handler screenHandler = new Handler(Looper.getMainLooper());

    // ── Overlay ───────────────────────────────────────────────────────────────

    private void showOverlay() {
        overlayPanel.setVisibility(View.VISIBLE);
        overlayPanel.animate().alpha(1f).setDuration(200).start();
        hideHandler.removeCallbacksAndMessages(null);
        hideHandler.postDelayed(this::hideOverlay, OVERLAY_HIDE_DELAY);
    }

    private void hideOverlay() {
        overlayPanel.animate().alpha(0f).setDuration(300).withEndAction(() ->
            overlayPanel.setVisibility(View.GONE)
        ).start();
    }

    // ── Ping ──────────────────────────────────────────────────────────────────

    private void schedulePing() {
        pingHandler.postDelayed(this::doPing, PING_INTERVAL);
    }

    private void doPing() {
        String serverUrl = getServerUrl();
        executor.execute(() -> {
            boolean ok = false;
            long ms = -1;
            try {
                long start = System.currentTimeMillis();
                HttpURLConnection conn = (HttpURLConnection) new URL(serverUrl + "/api/content").openConnection();
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4000);
                conn.setRequestMethod("HEAD");
                int code = conn.getResponseCode();
                ms = System.currentTimeMillis() - start;
                ok = (code >= 200 && code < 500);
                conn.disconnect();
            } catch (IOException ignored) {}

            final boolean isOk = ok;
            final long pingMs = ms;
            pingHandler.post(() -> {
                if (isOk) {
                    tvPingStatus.setText("● Сервер: " + pingMs + " мс");
                    tvPingStatus.setTextColor(0xFF52C97E);
                } else {
                    tvPingStatus.setText("● Сервер недоступен");
                    tvPingStatus.setTextColor(0xFFE05252);
                }
                schedulePing();
            });
        });
    }

    // ── WebView ───────────────────────────────────────────────────────────────

    private void setupWebView() {
        if (android.os.Build.VERSION.SDK_INT >= 29) {
            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        }

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUserAgentString(
            "Mozilla/5.0 (Linux; Android 9; Android TV) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 DS-Player/1.0"
        );

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.grant(request.getResources());
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                // Required for some WebView versions to allow media playback
            }

            @Override
            public void onHideCustomView() {}
        });

        if (android.os.Build.VERSION.SDK_INT >= 31) {
            webView.setWebViewRenderProcessClient(getMainExecutor(), new android.webkit.WebViewRenderProcessClient() {
                @Override
                public void onRenderProcessUnresponsive(WebView view, android.webkit.WebViewRenderProcess renderer) {
                    if (renderer != null) renderer.terminate();
                }
                @Override
                public void onRenderProcessResponsive(WebView view, android.webkit.WebViewRenderProcess renderer) {}
            });
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
                errorView.setVisibility(View.GONE);
            }
            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                // Unlock audio: resume AudioContext, dispatch interaction, unmute all videos
                view.evaluateJavascript(
                    "(function(){" +
                    "  try {" +
                    "    var ac = new (window.AudioContext || window.webkitAudioContext)();" +
                    "    ac.resume();" +
                    "  } catch(e) {}" +
                    "  document.dispatchEvent(new MouseEvent('click', {bubbles:true}));" +
                    "  document.dispatchEvent(new Event('player-interaction'));" +
                    "  function unmuteAll() {" +
                    "    document.querySelectorAll('video').forEach(function(v){" +
                    "      v.muted = false;" +
                    "      if (v.paused) v.play().catch(function(){});" +
                    "    });" +
                    "  }" +
                    "  unmuteAll();" +
                    "  setTimeout(unmuteAll, 500);" +
                    "  setTimeout(unmuteAll, 1500);" +
                    "  setTimeout(unmuteAll, 3000);" +
                    "})();",
                    null
                );
            }
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    progressBar.setVisibility(View.GONE);
                    errorView.setText("Нет подключения к серверу\n\n" + getServerUrl() + "\n\nПроверьте сеть и настройки.");
                    errorView.setVisibility(View.VISIBLE);
                    webView.postDelayed(MainActivity.this::loadPlayer, 10000);
                }
            }
        });

        webView.setOnTouchListener((v, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN ||
                event.getAction() == MotionEvent.ACTION_MOVE) {
                showOverlay();
            }
            return false;
        });
    }

    private String getServerUrl() {
        return prefs.getString("server_url", "http://localhost:3001");
    }

    // Frontend URL: same host as backend but on port 3000 (nginx serves the React app).
    // If server_url already points to port 3000 (or any non-3001 port), use it as-is.
    private String getFrontendUrl() {
        String url = getServerUrl();
        try {
            java.net.URL u = new java.net.URL(url);
            if (u.getPort() == 3001) {
                return u.getProtocol() + "://" + u.getHost() + ":3000";
            }
        } catch (Exception ignored) {}
        return url;
    }

    private void loadPlayer() {
        String screenId = prefs.getString("screen_id", "");
        if (screenId.isEmpty()) {
            String deviceId = prefs.getString("device_id", "");
            if (!deviceId.isEmpty()) {
                showWaitingForScreen();
                startScreenPolling(deviceId);
            } else {
                openSettings();
            }
            return;
        }
        errorView.setVisibility(View.GONE);
        webView.clearHistory();
        String deviceTok = getDeviceToken();
        String playerUrl = getFrontendUrl() + "/player/" + screenId
            + (deviceTok.isEmpty() ? "" : "?token=" + deviceTok);
        webView.loadUrl(playerUrl);
    }

    private void openSettings() {
        startActivityForResult(new Intent(this, SettingsActivity.class), 1);
    }

    // ── Manual TV command polling ─────────────────────────────────────────────

    private void startTvCommandPoll() {
        String deviceId = prefs.getString("device_id", "");
        if (deviceId.isEmpty() || tvCommandPolling) return;
        tvCommandPolling = true;
        tvCommandHandler.postDelayed(() -> doTvCommandPoll(deviceId), TV_COMMAND_POLL_INTERVAL);
    }

    private void doTvCommandPoll(String deviceId) {
        if (!tvCommandPolling) return;
        String serverUrl = getServerUrl();
        String token = getDeviceToken();
        if (token.isEmpty()) {
            tvCommandHandler.postDelayed(() -> doTvCommandPoll(deviceId), TV_COMMAND_POLL_INTERVAL);
            return;
        }
        executor.execute(() -> {
            try {
                java.net.URL url = new java.net.URL(serverUrl + "/api/devices/" + deviceId + "/tv-command?token=" + token);
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                int code = conn.getResponseCode();
                StringBuilder resp = new StringBuilder();
                try (java.io.BufferedReader br = new java.io.BufferedReader(
                        new java.io.InputStreamReader(conn.getInputStream()))) {
                    String line;
                    while ((line = br.readLine()) != null) resp.append(line);
                }
                conn.disconnect();

                if (code == 200) {
                    org.json.JSONObject json = new org.json.JSONObject(resp.toString());
                    String command = json.isNull("command") ? null : json.optString("command", null);
                    tvCommandHandler.post(() -> {
                        if ("on".equals(command)) {
                            screenResume();
                        } else if ("off".equals(command)) {
                            screenSuspend();
                        }
                        tvCommandHandler.postDelayed(() -> doTvCommandPoll(deviceId), TV_COMMAND_POLL_INTERVAL);
                    });
                } else {
                    tvCommandHandler.post(() ->
                        tvCommandHandler.postDelayed(() -> doTvCommandPoll(deviceId), TV_COMMAND_POLL_INTERVAL));
                }
            } catch (Exception e) {
                tvCommandHandler.post(() ->
                    tvCommandHandler.postDelayed(() -> doTvCommandPoll(deviceId), TV_COMMAND_POLL_INTERVAL));
            }
        });
    }

    // ── Schedule polling ──────────────────────────────────────────────────────

    private void startSchedulePoll() {
        String deviceId = prefs.getString("device_id", "");
        if (deviceId.isEmpty() || schedulePolling) return;
        schedulePolling = true;
        scheduleHandler.postDelayed(() -> doSchedulePoll(deviceId), SCHEDULE_POLL_INTERVAL);
    }

    private void doSchedulePoll(String deviceId) {
        if (!schedulePolling) return;
        String serverUrl = getServerUrl();
        String token = getDeviceToken();
        if (token.isEmpty()) {
            scheduleHandler.postDelayed(() -> doSchedulePoll(deviceId), SCHEDULE_POLL_INTERVAL);
            return;
        }
        executor.execute(() -> {
            try {
                java.net.URL url = new java.net.URL(serverUrl + "/api/devices/" + deviceId + "/schedule?token=" + token);
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                int code = conn.getResponseCode();
                StringBuilder resp = new StringBuilder();
                try (java.io.BufferedReader br = new java.io.BufferedReader(
                        new java.io.InputStreamReader(conn.getInputStream()))) {
                    String line;
                    while ((line = br.readLine()) != null) resp.append(line);
                }
                conn.disconnect();

                if (code == 200) {
                    org.json.JSONObject json = new org.json.JSONObject(resp.toString());
                    boolean enabled = json.optBoolean("enabled", false);
                    if (!enabled) {
                        Log.d(TAG, "Schedule: disabled or not set — keeping off");
                        scheduleHandler.post(() -> {
                            scheduleHandler.postDelayed(() -> doSchedulePoll(deviceId), SCHEDULE_POLL_INTERVAL);
                        });
                        return;
                    }
                    String days = json.optString("days", "1111111");
                    String onTime = json.optString("on_time", "08:00");
                    String offTime = json.optString("off_time", "22:00");
                    boolean shouldBeOn = checkScheduleTime(days, onTime, offTime);
                    Log.d(TAG, "Schedule: enabled, days=" + days + " on=" + onTime + " off=" + offTime + " → shouldBeOn=" + shouldBeOn);
                    scheduleHandler.post(() -> {
                        applySchedule(shouldBeOn);
                        scheduleHandler.postDelayed(() -> doSchedulePoll(deviceId), SCHEDULE_POLL_INTERVAL);
                    });
                } else {
                    Log.w(TAG, "Schedule poll: HTTP " + code);
                    scheduleHandler.post(() ->
                        scheduleHandler.postDelayed(() -> doSchedulePoll(deviceId), SCHEDULE_POLL_INTERVAL));
                }
            } catch (Exception e) {
                Log.w(TAG, "Schedule poll error: " + e.getMessage());
                scheduleHandler.post(() ->
                    scheduleHandler.postDelayed(() -> doSchedulePoll(deviceId), SCHEDULE_POLL_INTERVAL));
            }
        });
    }

    /**
     * days: "1111100" — index 0=Mon, 6=Sun.
     * Calendar.DAY_OF_WEEK: 1=Sun, 2=Mon, ..., 7=Sat.
     * Mapping: Calendar value → days index: Sun=6, Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5.
     */
    private boolean checkScheduleTime(String days, String onTime, String offTime) {
        java.util.Calendar cal = java.util.Calendar.getInstance();
        int calDay = cal.get(java.util.Calendar.DAY_OF_WEEK); // 1=Sun..7=Sat
        // Map to days-string index: Mon=0..Sun=6
        int[] calToDaysIdx = { 6, 0, 1, 2, 3, 4, 5 }; // index by (calDay-1)
        int dayIdx = calToDaysIdx[calDay - 1];
        if (dayIdx >= days.length() || days.charAt(dayIdx) != '1') return false;

        int nowMin = cal.get(java.util.Calendar.HOUR_OF_DAY) * 60 + cal.get(java.util.Calendar.MINUTE);
        int onMin = parseTime(onTime);
        int offMin = parseTime(offTime);
        if (onMin < offMin) {
            return nowMin >= onMin && nowMin < offMin;
        } else {
            // Overnight schedule (e.g. 22:00–06:00)
            return nowMin >= onMin || nowMin < offMin;
        }
    }

    private int parseTime(String hhmm) {
        try {
            String[] parts = hhmm.split(":");
            return Integer.parseInt(parts[0]) * 60 + Integer.parseInt(parts[1]);
        } catch (Exception e) {
            return 0;
        }
    }

    private void applySchedule(boolean on) {
        if (on == isScheduleActive) {
            Log.d(TAG, "Schedule: no change (already " + (on ? "on" : "off") + ")");
            return;
        }
        Log.d(TAG, "Schedule: applying → " + (on ? "ON" : "OFF"));
        isScheduleActive = on;
        if (on) {
            screenResume();
        } else {
            screenSuspend();
        }
    }

    private void screenSuspend() {
        isScreenSuspended = true;
        // 1. Останавливаем все медиа через JS — звук прекращается немедленно
        webView.evaluateJavascript(
            "(function(){" +
            "  document.querySelectorAll('video,audio').forEach(function(m){" +
            "    m.pause(); m.currentTime = 0;" +
            "  });" +
            "  try { window.__dsPlayerStop && window.__dsPlayerStop(); } catch(e){}" +
            "})();",
            null
        );
        // 2. Паузим WebView — останавливает JS таймеры, анимации, сетевые запросы
        webView.onPause();
        webView.pauseTimers();
        webView.setVisibility(View.GONE);
        // 3. Снимаем Keep Screen On — экран может погаснуть
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // 4. CEC Standby — выключаем TV по HDMI
        tvScreenOff();
    }

    private void screenResume() {
        isScreenSuspended = false;
        // 1. Включаем TV по HDMI + будим Box
        tvScreenOn();
        // 2. Восстанавливаем Keep Screen On
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // 3. Возобновляем WebView
        webView.setVisibility(View.VISIBLE);
        webView.resumeTimers();
        webView.onResume();
        // 4. Перезапускаем плеер через JS
        webView.evaluateJavascript(
            "(function(){" +
            "  try { window.__dsPlayerStart && window.__dsPlayerStart(); } catch(e){}" +
            "  document.querySelectorAll('video').forEach(function(v){" +
            "    v.play().catch(function(){});" +
            "  });" +
            "})();",
            null
        );
    }

    // Включить экран: WakeLock будит Android, CEC будит TV по HDMI
    @SuppressWarnings("deprecation")
    private void tvScreenOn() {
        // 1. Восстанавливаем нормальный таймаут экрана
        restoreScreenTimeout();
        // 2. WakeLock — будит экран Android Box
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            PowerManager.WakeLock wl = pm.newWakeLock(
                PowerManager.FULL_WAKE_LOCK |
                PowerManager.ACQUIRE_CAUSES_WAKEUP |
                PowerManager.ON_AFTER_RELEASE,
                "DSPlayer:wakelock"
            );
            wl.acquire(5000);
        }
        // 3. CEC "One Touch Play" — Box становится активным источником, TV включается
        sendCecCommand(true);
    }

    // Выключить экран Box + послать CEC Standby телевизору
    private void tvScreenOff() {
        // 1. CEC Standby — выключает TV по HDMI
        sendCecCommand(false);
        // 2. Даём CEC-пакету уйти по шине HDMI (500ms), затем гасим Box
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                try {
                    Method goToSleep = pm.getClass().getMethod("goToSleep", long.class);
                    goToSleep.invoke(pm, android.os.SystemClock.uptimeMillis());
                    Log.d(TAG, "Screen: goToSleep called");
                } catch (Exception e) {
                    Log.w(TAG, "goToSleep failed: " + e.getMessage());
                }
            }
        }, 500);
    }

    // Восстановить стандартный таймаут когда включаемся
    private void restoreScreenTimeout() {
        if (Settings.System.canWrite(this)) {
            try {
                Settings.System.putInt(getContentResolver(),
                    Settings.System.SCREEN_OFF_TIMEOUT, 10 * 60 * 1000);
            } catch (Exception ignored) {}
        }
    }

    // Запросить WRITE_SETTINGS если не выдано — открываем системный экран разрешений
    private void requestWriteSettingsIfNeeded() {
        if (!Settings.System.canWrite(this)) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS,
                Uri.parse("package:" + getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                startActivity(intent);
            } catch (Exception e) {
                Log.w(TAG, "Cannot open WRITE_SETTINGS screen: " + e.getMessage());
            }
        }
    }

    /**
     * Отправить CEC команду через HdmiControlManager (reflection — публичный API скрыт).
     * on=true  → "Text View On" (0x8D) / "Image View On" (0x04) — включить TV
     * on=false → "Standby" (0x36) — выключить TV
     *
     * Работает на большинстве TV Box с Android 5+ если TV поддерживает HDMI-CEC
     * (Anynet+, Bravia Sync, SimpLink, EasyLink и т.д.)
     */
    private static final String TAG = "DSPlayer";

    private void sendCecCommand(boolean on) {
        try {
            Object hdmiManager = getSystemService("hdmi_control");
            if (hdmiManager == null) {
                Log.w(TAG, "CEC: hdmi_control service unavailable — no HDMI on this device or emulator");
                return;
            }
            Log.d(TAG, "CEC: hdmiManager class = " + hdmiManager.getClass().getName());

            Method getPlaybackClient = hdmiManager.getClass().getMethod("getPlaybackClient");
            Object playbackClient = getPlaybackClient.invoke(hdmiManager);
            if (playbackClient == null) {
                Log.w(TAG, "CEC: getPlaybackClient() returned null — device may not be a Playback device");
                return;
            }
            Log.d(TAG, "CEC: playbackClient class = " + playbackClient.getClass().getName());

            if (on) {
                Method oneTouchPlay = playbackClient.getClass().getMethod(
                    "oneTouchPlay",
                    Class.forName("android.hardware.hdmi.HdmiPlaybackClient$OneTouchPlayCallback")
                );
                oneTouchPlay.invoke(playbackClient, (Object) null);
                Log.d(TAG, "CEC: oneTouchPlay sent");
            } else {
                // Пробуем sendStandby(int targetAddress) — 0 = TV
                // Если нет такой сигнатуры — fallback на sendStandby()
                try {
                    Method sendStandby = playbackClient.getClass().getMethod("sendStandby", int.class);
                    sendStandby.invoke(playbackClient, 0); // 0 = TV address
                    Log.d(TAG, "CEC: sendStandby(0) sent");
                } catch (NoSuchMethodException e1) {
                    try {
                        Method sendStandby = playbackClient.getClass().getMethod("sendStandby");
                        sendStandby.invoke(playbackClient);
                        Log.d(TAG, "CEC: sendStandby() sent");
                    } catch (Exception e2) {
                        Log.e(TAG, "CEC: sendStandby failed — " + e2.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "CEC: failed — " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    // ── System UI ─────────────────────────────────────────────────────────────

    private void hideSystemUI() {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            android.view.WindowInsetsController ctrl = getWindow().getInsetsController();
            if (ctrl != null) {
                ctrl.hide(android.view.WindowInsets.Type.systemBars());
                ctrl.setSystemBarsBehavior(
                    android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            //noinspection deprecation
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN |
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            );
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 1) startUp();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && event.getRepeatCount() > 0) {
            openSettings(); return true;
        }
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            openSettings(); return true;
        }
        // Remote control: media keys → player commands via JS
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || keyCode == KeyEvent.KEYCODE_MEDIA_PAUSE) {
            webView.evaluateJavascript("window.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));", null);
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY) {
            webView.evaluateJavascript("window.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));", null);
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_MEDIA_NEXT || keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
            webView.evaluateJavascript("window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',code:'ArrowRight',bubbles:true}));", null);
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PREVIOUS || keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
            webView.evaluateJavascript("window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',code:'ArrowLeft',bubbles:true}));", null);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onBackPressed() {}

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUI();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!isScreenSuspended) {
            webView.resumeTimers();
            webView.onResume();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (!isScreenSuspended) webView.onPause();
    }

    @Override
    protected void onDestroy() {
        screenPolling = false;
        schedulePolling = false;
        tvCommandPolling = false;
        approvalPolling = false;
        hideHandler.removeCallbacksAndMessages(null);
        pingHandler.removeCallbacksAndMessages(null);
        screenPollHandler.removeCallbacksAndMessages(null);
        screenHandler.removeCallbacksAndMessages(null);
        scheduleHandler.removeCallbacksAndMessages(null);
        tvCommandHandler.removeCallbacksAndMessages(null);
        approvalHandler.removeCallbacksAndMessages(null);
        executor.shutdown();
        webView.destroy();
        super.onDestroy();
    }
}
