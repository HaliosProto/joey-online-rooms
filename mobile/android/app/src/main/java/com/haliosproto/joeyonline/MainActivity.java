package com.haliosproto.joeyonline;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.util.Base64;
import android.widget.Toast;
import java.io.OutputStream;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public final class MainActivity extends Activity {
    private static final String GAME = "https://haliosproto.github.io/joey-online-rooms/";
    private WebView game;
    private byte[] pendingBackup;
    private static final int EXPORT_SAVE = 8;
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        game = new WebView(this);
        game.setBackgroundColor(Color.rgb(11,18,32));
        WebSettings settings = game.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        game.setWebChromeClient(new WebChromeClient());
        game.addJavascriptInterface(new SaveExport(), "JoeySaveExport");
        game.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "haliosproto.github.io".equals(uri.getHost()) && uri.getPath() != null && uri.getPath().startsWith("/joey-online-rooms/")) return false;
                if ("https".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (RuntimeException ignored) {}
                }
                return true;
            }
        });
        setContentView(game);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        game.loadUrl(GAME);
    }
    @Override public void onBackPressed() {
        game.evaluateJavascript("(typeof window.joeyBack==='function' && window.joeyBack()) ? true : false", result -> {
            if (!"true".equals(result)) new AlertDialog.Builder(this).setTitle("Close Joey Online?").setMessage("Finish or save your game before leaving.").setPositiveButton("Close", (dialog,which) -> finish()).setNegativeButton("Keep playing", null).show();
        });
    }
    public final class SaveExport {
        @JavascriptInterface public void save(String encoded) {
            if (encoded == null || encoded.length() > 32 * 1024 * 1024) return;
            final byte[] bytes;
            try { bytes = Base64.decode(encoded, Base64.DEFAULT); } catch (IllegalArgumentException error) { return; }
            if (bytes.length < 4 || bytes[0] != 80 || bytes[1] != 75) return;
            runOnUiThread(() -> {
                if (pendingBackup != null || game == null || game.getUrl() == null || !game.getUrl().startsWith(GAME)) return;
                pendingBackup = bytes;
                Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/zip").putExtra(Intent.EXTRA_TITLE, "Joey-Online-save-backup.zip");
                try { startActivityForResult(create, EXPORT_SAVE); } catch (RuntimeException error) { pendingBackup = null; Toast.makeText(MainActivity.this, "No file picker is available", Toast.LENGTH_LONG).show(); }
            });
        }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != EXPORT_SAVE) return;
        final byte[] bytes = pendingBackup; pendingBackup = null;
        if (result != RESULT_OK || data == null || data.getData() == null || bytes == null) return;
        final Uri destination = data.getData();
        new Thread(() -> {
            boolean success = false;
            try (OutputStream out = getContentResolver().openOutputStream(destination, "w")) { if (out != null) { out.write(bytes); success = true; } } catch (Exception ignored) {}
            final boolean saved = success;
            runOnUiThread(() -> Toast.makeText(this, saved ? "Save backup exported" : "Could not export save backup", Toast.LENGTH_LONG).show());
        }, "JoeySaveExport").start();
    }
    @Override protected void onDestroy() { if (game != null) game.destroy(); super.onDestroy(); }
}
