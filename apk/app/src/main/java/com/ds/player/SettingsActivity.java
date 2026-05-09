package com.ds.player;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import android.bluetooth.BluetoothAdapter;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Random;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class SettingsActivity extends Activity {

    private SharedPreferences prefs;
    private EditText etServerUrl;
    private TextView tvHint;

    // Linked device panel
    private LinearLayout deviceInfoPanel;
    private TextView tvDeviceInfo;

    // Pairing panel
    private LinearLayout pairPanel;
    private LinearLayout codeDisplay;
    private TextView tvCodeBig;
    private EditText etCode;
    private TextView tvPairStatus;
    private Button btnPair;
    private Button btnPairManual;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private boolean polling = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);

        prefs = getSharedPreferences("ds_prefs", MODE_PRIVATE);

        etServerUrl = findViewById(R.id.et_server_url);
        tvHint = findViewById(R.id.tv_hint);

        deviceInfoPanel = findViewById(R.id.screen_info_panel);
        tvDeviceInfo = findViewById(R.id.tv_screen_info);

        pairPanel = findViewById(R.id.pair_panel);
        codeDisplay = findViewById(R.id.code_display);
        tvCodeBig = findViewById(R.id.tv_code_big);
        etCode = findViewById(R.id.et_code);
        tvPairStatus = findViewById(R.id.tv_pair_status);
        btnPair = findViewById(R.id.btn_pair);
        btnPairManual = findViewById(R.id.btn_pair_manual);

        etServerUrl.setText(prefs.getString("server_url", "http://localhost:3001"));

        etServerUrl.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE ||
                (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER)) {
                hideKeyboard(); return true;
            }
            return false;
        });

        etCode.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE ||
                (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER)) {
                hideKeyboard(); return true;
            }
            return false;
        });

        findViewById(R.id.settings_root).setOnClickListener(v -> hideKeyboard());

        // Back — return to player without changes
        findViewById(R.id.btn_close).setOnClickListener(v -> {
            setResult(RESULT_CANCELED);
            finish();
        });

        // Check server connectivity
        findViewById(R.id.btn_check_server).setOnClickListener(v -> {
            hideKeyboard();
            String url = etServerUrl.getText().toString().trim();
            if (url.isEmpty()) { tvHint.setText("Введите адрес сервера"); return; }
            if (url.endsWith("/")) url = url.substring(0, url.length() - 1);
            tvHint.setText("Проверка...");
            tvHint.setTextColor(0xFF888888);
            final String checkUrl = url;
            executor.execute(() -> {
                boolean ok = false;
                long ms = -1;
                try {
                    long start = System.currentTimeMillis();
                    HttpURLConnection conn = (HttpURLConnection) new URL(checkUrl + "/api/content").openConnection();
                    conn.setRequestMethod("HEAD");
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);
                    int code = conn.getResponseCode();
                    ms = System.currentTimeMillis() - start;
                    ok = (code >= 200 && code < 500);
                    conn.disconnect();
                } catch (Exception ignored) {}
                final boolean isOk = ok;
                final long ping = ms;
                handler.post(() -> {
                    if (isOk) {
                        tvHint.setText("✓ Сервер доступен (" + ping + " мс)");
                        tvHint.setTextColor(0xFF52C97E);
                    } else {
                        tvHint.setText("✗ Сервер недоступен");
                        tvHint.setTextColor(0xFFE05252);
                    }
                });
            });
        });

        // Save server URL
        findViewById(R.id.btn_save_url).setOnClickListener(v -> {
            hideKeyboard();
            String url = etServerUrl.getText().toString().trim();
            if (url.isEmpty()) { tvHint.setText("Введите адрес сервера"); return; }
            if (url.endsWith("/")) url = url.substring(0, url.length() - 1);
            prefs.edit().putString("server_url", url).apply();
            tvHint.setTextColor(0xFF888888);
            tvHint.setText("Адрес сохранён");
        });

        // Unlink device — clear device_id, screen_id and token
        findViewById(R.id.btn_unlink).setOnClickListener(v -> {
            prefs.edit()
                .putString("device_id", "")
                .putString("screen_id", "")
                .putString("device_token", "")
                .putString("device_code", "")
                .apply();
            deviceInfoPanel.setVisibility(View.GONE);
            showPairPanel();
        });

        btnPair.setOnClickListener(v -> {
            hideKeyboard();
            String code = etCode.getText().toString().trim().toUpperCase();
            if (code.isEmpty()) { tvPairStatus.setText("Введите код устройства"); return; }
            doRegister(code);
        });

        btnPairManual.setOnClickListener(v -> {
            hideKeyboard();
            String code = generateCode();
            etCode.setText(code);
            doRegister(code);
        });

        // Determine what to show
        String deviceId = prefs.getString("device_id", "");
        String screenId = prefs.getString("screen_id", "");

        if (!deviceId.isEmpty()) {
            // Device is registered — show info
            pairPanel.setVisibility(View.GONE);
            deviceInfoPanel.setVisibility(View.VISIBLE);
            String code = prefs.getString("device_code", "");
            String info = "Устройство зарегистрировано";
            if (!code.isEmpty()) info += "\nКод: " + code;
            if (!screenId.isEmpty()) info += "\n✓ Экран назначен";
            else info += "\nОжидание назначения экрана...";
            tvDeviceInfo.setText(info);
        } else {
            deviceInfoPanel.setVisibility(View.GONE);
            showPairPanel();
        }
    }

    private void showPairPanel() {
        pairPanel.setVisibility(View.VISIBLE);
        codeDisplay.setVisibility(View.GONE);
        tvPairStatus.setText("Введите код или нажмите «Новый код» для автогенерации.");
    }

    private String getDeviceName() {
        // Try Bluetooth name first — most human-readable
        try {
            android.bluetooth.BluetoothAdapter bt = android.bluetooth.BluetoothAdapter.getDefaultAdapter();
            if (bt != null) {
                String btName = bt.getName();
                if (btName != null && !btName.isEmpty()) return btName;
            }
        } catch (Exception ignored) {}

        // Fallback: "Manufacturer Model", dedup if model already contains manufacturer
        String manufacturer = android.os.Build.MANUFACTURER;
        String model = android.os.Build.MODEL;
        if (model.toLowerCase().startsWith(manufacturer.toLowerCase())) {
            return capitalize(model);
        }
        return capitalize(manufacturer) + " " + model;
    }

    private String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    private String generateCode() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        Random rng = new Random();
        StringBuilder sb = new StringBuilder(6);
        for (int i = 0; i < 6; i++) sb.append(chars.charAt(rng.nextInt(chars.length())));
        return sb.toString();
    }

    private void doRegister(String code) {
        String serverUrl = etServerUrl.getText().toString().trim();
        if (serverUrl.isEmpty()) { tvPairStatus.setText("Сначала укажите адрес сервера"); return; }
        if (serverUrl.endsWith("/")) serverUrl = serverUrl.substring(0, serverUrl.length() - 1);
        prefs.edit().putString("server_url", serverUrl).apply();

        btnPair.setEnabled(false);
        btnPairManual.setEnabled(false);
        tvPairStatus.setText("Регистрация...");
        codeDisplay.setVisibility(View.GONE);

        final String finalUrl = serverUrl;
        final String finalCode = code;

        executor.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("code", finalCode);
                body.put("name", getDeviceName());

                URL url = new URL(finalUrl + "/api/devices/register");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.setConnectTimeout(6000);
                conn.setReadTimeout(6000);

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }

                int responseCode = conn.getResponseCode();
                StringBuilder resp = new StringBuilder();
                try (BufferedReader br = new BufferedReader(
                        new InputStreamReader(responseCode < 400 ? conn.getInputStream() : conn.getErrorStream()))) {
                    String line;
                    while ((line = br.readLine()) != null) resp.append(line);
                }
                conn.disconnect();

                if (responseCode >= 200 && responseCode < 300) {
                    JSONObject json = new JSONObject(resp.toString());
                    String deviceId = json.getString("id");
                    boolean approved = json.optBoolean("approved", false);
                    String token = approved ? json.optString("token", "") : "";

                    handler.post(() -> {
                        prefs.edit()
                            .putString("device_id", deviceId)
                            .putString("device_code", finalCode)
                            .apply();
                        if (approved && !token.isEmpty()) {
                            prefs.edit().putString("device_token", token).apply();
                        }

                        tvCodeBig.setText(finalCode);
                        codeDisplay.setVisibility(View.VISIBLE);

                        if (approved) {
                            tvPairStatus.setText("✓ Устройство подтверждено! Ожидание экрана...");
                            tvPairStatus.setTextColor(0xFF52C97E);
                            btnPair.setEnabled(true);
                            btnPairManual.setEnabled(true);
                            startPolling(deviceId);
                        } else {
                            tvPairStatus.setText("Ожидание подтверждения в админке...\nКод: " + finalCode);
                            btnPair.setEnabled(true);
                            btnPairManual.setEnabled(true);
                            startPolling(deviceId);
                        }
                    });
                } else {
                    handler.post(() -> {
                        tvPairStatus.setText("Ошибка сервера: " + responseCode + "\n" + resp);
                        btnPair.setEnabled(true);
                        btnPairManual.setEnabled(true);
                    });
                }
            } catch (Exception e) {
                handler.post(() -> {
                    tvPairStatus.setText("Не удалось подключиться:\n" + e.getMessage());
                    btnPair.setEnabled(true);
                    btnPairManual.setEnabled(true);
                });
            }
        });
    }

    private void startPolling(String id) {
        if (polling) return;
        polling = true;
        schedulePoll(id);
    }

    private void schedulePoll(String id) {
        handler.postDelayed(() -> doPoll(id), 4000);
    }

    // Polls register until approved → then polls /screen until assigned
    private void doPoll(String id) {
        if (!polling) return;
        String serverUrl = prefs.getString("server_url", "");
        String deviceCode = prefs.getString("device_code", "");
        String savedToken = prefs.getString("device_token", "");
        boolean alreadyApproved = !savedToken.isEmpty();

        executor.execute(() -> {
            try {
                if (!alreadyApproved) {
                    // Phase 1: re-register to check if approved and get token
                    JSONObject body = new JSONObject();
                    body.put("code", deviceCode);
                    URL url = new URL(serverUrl + "/api/devices/register");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setDoOutput(true);
                    conn.setConnectTimeout(6000);
                    conn.setReadTimeout(6000);
                    try (java.io.OutputStream os = conn.getOutputStream()) {
                        os.write(body.toString().getBytes(StandardCharsets.UTF_8));
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
                            prefs.edit().putString("device_token", token).apply();
                            handler.post(() -> {
                                tvPairStatus.setText("✓ Устройство подтверждено! Ожидание экрана...");
                                tvPairStatus.setTextColor(0xFF52C97E);
                                schedulePoll(id);
                            });
                        } else {
                            handler.post(() -> {
                                tvPairStatus.setText("Ожидание подтверждения в админке...\nКод: " + deviceCode);
                                schedulePoll(id);
                            });
                        }
                    } else {
                        handler.post(() -> schedulePoll(id));
                    }
                } else {
                    // Phase 2: approved — poll /screen with token
                    URL url = new URL(serverUrl + "/api/devices/" + id + "/screen?token=" + savedToken);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(6000);
                    conn.setReadTimeout(6000);
                    int code = conn.getResponseCode();
                    if (code == 401 || code == 403) {
                        // Token revoked — back to waiting for approval
                        prefs.edit().putString("device_token", "").apply();
                        handler.post(() -> {
                            tvPairStatus.setText("Подтверждение отозвано. Ожидание повторного подтверждения...");
                            tvPairStatus.setTextColor(0xFFE05252);
                            schedulePoll(id);
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
                        String screenId = json.optString("screen_id", "");
                        handler.post(() -> {
                            if (!screenId.isEmpty() && !screenId.equals("null")) {
                                polling = false;
                                prefs.edit().putString("screen_id", screenId).apply();
                                tvPairStatus.setText("✓ Экран назначен! Запуск плеера...");
                                tvPairStatus.setTextColor(0xFF52C97E);
                                handler.postDelayed(() -> {
                                    setResult(RESULT_OK);
                                    finish();
                                }, 1500);
                            } else {
                                schedulePoll(id);
                            }
                        });
                    } else {
                        handler.post(() -> schedulePoll(id));
                    }
                }
            } catch (Exception e) {
                handler.post(() -> schedulePoll(id));
            }
        });
    }

    private void hideKeyboard() {
        View focus = getCurrentFocus();
        if (focus != null) {
            InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
            imm.hideSoftInputFromWindow(focus.getWindowToken(), 0);
            focus.clearFocus();
        }
    }

    @Override
    protected void onDestroy() {
        polling = false;
        handler.removeCallbacksAndMessages(null);
        executor.shutdown();
        super.onDestroy();
    }
}
