package de.zeitblick.kamera;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.*;
import android.view.WindowInsets;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

public final class MainActivity extends Activity {
 private static final String ORIGIN = "https://appassets.androidplatform.net";
 private WebView web;
 private PermissionRequest cameraRequest;
 private ValueCallback<Uri[]> fileCallback;
 private final ExecutorService io = Executors.newSingleThreadExecutor();

 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  web = new WebView(this);
  web.setBackgroundColor(Color.rgb(11,16,13));
  setContentView(web);
  if (android.os.Build.VERSION.SDK_INT >= 30) {
   getWindow().setDecorFitsSystemWindows(false);
   web.setOnApplyWindowInsetsListener((view,insets) -> {
    android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
    view.setPadding(bars.left,bars.top,bars.right,bars.bottom); return insets;
   });
  }
  WebSettings settings=web.getSettings();
  settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
  settings.setAllowFileAccess(false); settings.setAllowContentAccess(true);
  settings.setMediaPlaybackRequiresUserGesture(false);
  settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  WebView.setWebContentsDebuggingEnabled(false);
  web.addJavascriptInterface(new PhotoStorage(), "ZeitblickAndroid");
  web.setWebViewClient(new WebViewClient() {
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request) {
    Uri uri=request.getUrl();
    if (!"https".equals(uri.getScheme()) || !"appassets.androidplatform.net".equals(uri.getHost())) return blocked();
    String path=uri.getPath(); if(path==null||path.equals("/")) path="/index.html";
    if(path.contains("..")) return blocked();
    try {
     String mime=path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":path.endsWith(".svg")?"image/svg+xml":path.endsWith(".png")?"image/png":path.endsWith(".webmanifest")?"application/manifest+json":path.endsWith(".html")?"text/html":"application/octet-stream";
     return new WebResourceResponse(mime,"UTF-8",getAssets().open("web"+path));
    } catch(IOException e) { return blocked(); }
   }
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
    Uri uri=request.getUrl();
    if(ORIGIN.equals(uri.getScheme()+"://"+uri.getHost())) return false;
    return true;
   }
  });
  web.setWebChromeClient(new WebChromeClient() {
   @Override public void onPermissionRequest(PermissionRequest request) {
    runOnUiThread(() -> {
     if (!ORIGIN.equals(request.getOrigin().toString().replaceAll("/$","")) || !Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) { request.deny(); return; }
     if(cameraRequest!=null) cameraRequest.deny();
     if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED) request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
     else {cameraRequest=request;requestPermissions(new String[]{Manifest.permission.CAMERA},100);}
    });
   }
   @Override public void onPermissionRequestCanceled(PermissionRequest request) { if(cameraRequest==request) cameraRequest=null; }
   @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params) {
    if(fileCallback!=null)fileCallback.onReceiveValue(null);
    fileCallback=callback;
    Intent choose=new Intent(Intent.ACTION_OPEN_DOCUMENT); choose.setType("image/*");choose.addCategory(Intent.CATEGORY_OPENABLE);
    try {startActivityForResult(choose,200);} catch(Exception e){fileCallback.onReceiveValue(null);fileCallback=null;}
    return true;
   }
  });
  web.loadUrl(ORIGIN+"/index.html");
 }
 private WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
 @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){
  super.onRequestPermissionsResult(code,permissions,results);
  if(code==100&&cameraRequest!=null){
   if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)cameraRequest.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});else cameraRequest.deny();
   cameraRequest=null;
  }
 }
 @Override protected void onActivityResult(int code,int result,Intent data){
  super.onActivityResult(code,result,data);
  if(code==200&&fileCallback!=null){fileCallback.onReceiveValue(result==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);fileCallback=null;}
 }
 @Override protected void onPause(){
  if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('zeitblick-pause'))",null);
  super.onPause();
 }
 @Override public void onBackPressed(){
  web.evaluateJavascript("(function(){var d=document.querySelector('[role=dialog]');if(d){var b=d.querySelector('.back-button, .dialog-close, .sheet-heading button');if(b){b.click();return true}}return false})()", value -> {if(!"true".equals(value)) moveTaskToBack(true);});
 }
 @Override protected void onDestroy(){
  if(cameraRequest!=null)cameraRequest.deny();
  if(fileCallback!=null)fileCallback.onReceiveValue(null);
  io.shutdown(); if(web!=null){web.removeJavascriptInterface("ZeitblickAndroid");web.destroy();}
  super.onDestroy();
 }
 public final class PhotoStorage {
  @JavascriptInterface public void savePhotos(String payload){io.execute(() -> save(payload));}
  private void save(String payload){
   String id="";ArrayList<Uri> inserted=new ArrayList<>();JSONObject response=new JSONObject();
   try{
    JSONObject message=new JSONObject(payload);id=message.getString("id");JSONArray images=message.getJSONArray("images");
    if(images.length()<1||images.length()>2)throw new IOException("Ungültige Fotoanzahl");
    for(int i=0;i<images.length();i++){
     JSONObject image=images.getJSONObject(i);String name=image.getString("name");
     if(!name.matches("zeitblick-[A-Za-z0-9._-]+\\.jpg"))throw new IOException("Ungültiger Dateiname");
     String encoded=image.getString("data");if(encoded.length()>60000000)throw new IOException("Foto ist zu groß");
     byte[] bytes=Base64.decode(encoded,Base64.DEFAULT);
     if(bytes.length<4||(bytes[0]&255)!=255||(bytes[1]&255)!=216)throw new IOException("Ungültiges JPG");
     ContentValues values=new ContentValues();values.put(MediaStore.Images.Media.DISPLAY_NAME,name);values.put(MediaStore.Images.Media.MIME_TYPE,"image/jpeg");values.put(MediaStore.Images.Media.RELATIVE_PATH,"Pictures/Zeitblick");values.put(MediaStore.Images.Media.IS_PENDING,1);
     Uri uri=getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values);if(uri==null)throw new IOException("Galerie nicht verfügbar");inserted.add(uri);
     try(OutputStream out=getContentResolver().openOutputStream(uri)){if(out==null)throw new IOException("Speicher nicht verfügbar");out.write(bytes);}
    }
    for(Uri uri:inserted){ContentValues ready=new ContentValues();ready.put(MediaStore.Images.Media.IS_PENDING,0);getContentResolver().update(uri,ready,null,null);}
    response.put("success",true);response.put("count",inserted.size());
   }catch(Exception error){
    for(Uri uri:inserted){try{getContentResolver().delete(uri,null,null);}catch(Exception ignored){}}
    try{response.put("success",false);response.put("error","Die Fotos konnten nicht gespeichert werden. Prüfe, ob genug Speicherplatz frei ist.");}catch(JSONException ignored){}
   }
   try{response.put("id",id);}catch(JSONException ignored){}
   final String javascript="window.dispatchEvent(new CustomEvent('zeitblick-save-result',{detail:"+response.toString()+"}))";
   runOnUiThread(() -> {if(!isFinishing()&&!isDestroyed()&&web!=null)web.evaluateJavascript(javascript,null);});
  }
 }
}
