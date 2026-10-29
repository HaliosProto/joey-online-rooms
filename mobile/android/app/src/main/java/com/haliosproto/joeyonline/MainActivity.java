package com.haliosproto.joeyonline;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public final class MainActivity extends Activity {
    private static final String GAME = "https://haliosproto.github.io/joey-online-rooms/";
    private WebView game;
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
    @Override protected void onDestroy() { if (game != null) game.destroy(); super.onDestroy(); }
}
