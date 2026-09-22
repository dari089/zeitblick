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
import android.widget.FrameLayout;
import android.view.ViewGroup;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

public final class MainActivity extends Activity {
 private static final String ORIGIN = "https://appassets.androidplatform.net";
 private WebView web;
 private android.view.TextureView texture;
 private CameraController camera;
 private String[] pendingCamera;
 private PermissionRequest cameraRequest;
 private ValueCallback<Uri[]> fileCallback;
 private ReferenceImages references;
 private boolean pickingReference;
 private String referenceRequest="";
 private final ExecutorService io = Executors.newSingleThreadExecutor();

 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  references=new ReferenceImages(getContentResolver(),getCacheDir());
  web = new WebView(this);
  web.setBackgroundColor(Color.TRANSPARENT);
  FrameLayout root=new FrameLayout(this);
  root.setBackgroundColor(Color.rgb(11,16,13));
  texture=new android.view.TextureView(this);
  root.addView(texture,new FrameLayout.LayoutParams(1,1));
  camera=new CameraController(this,texture,new CameraController.Listener(){
   public void cameras(JSONArray choices){emit("zeitblick-cameras",json("cameras",choices));}
   public void ready(String id,JSONObject value){try{value.put("requestId",id);}catch(Exception ignored){}emit("zeitblick-camera-result",value);}
   public void error(String id,String error){emit("zeitblick-camera-result",result(id,error));}
   public void photoError(String id,String error){emit("zeitblick-photo-result",result(id,error));}
   public void photo(String id,byte[] jpeg){io.execute(() -> {try{JSONObject value=json("requestId",id);value.put("url",references.storeJpeg(jpeg));emit("zeitblick-photo-result",value);}catch(Exception e){photoError(id,"Das Foto konnte nicht vorbereitet werden.");}});}
  });
  root.addView(web,new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));
  setContentView(root);
  if (android.os.Build.VERSION.SDK_INT >= 30) {
   getWindow().setDecorFitsSystemWindows(false);
   // Insets belong to the native container: WebView's viewport itself must
   // shrink, rather than painting HTML beneath the status/navigation bars.
   root.setOnApplyWindowInsetsListener((view,insets) -> {
    android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
    view.setPadding(bars.left,bars.top,bars.right,bars.bottom); return insets;
   });
   root.requestApplyInsets();
  }
  WebSettings settings=web.getSettings();
  settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
  settings.setSupportZoom(false); settings.setBuiltInZoomControls(false); settings.setDisplayZoomControls(false);
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
     if(path.startsWith("/reference/")) return references.serve(path.substring("/reference/".length()));
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
    String mime="image/*";for(String accept:params.getAcceptTypes()){if(accept!=null&&accept.startsWith("video/")){mime="video/*";break;}}
    Intent choose=mediaChooser(mime);
    try {startActivityForResult(choose,200);} catch(Exception e){fileCallback.onReceiveValue(null);fileCallback=null;}
    return true;
   }
  });
  web.loadUrl(ORIGIN+"/index.html");
 }
 private Intent mediaChooser(String mime){
  Intent content=new Intent(Intent.ACTION_GET_CONTENT);content.setType(mime);content.addCategory(Intent.CATEGORY_OPENABLE);content.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
  Intent chooser=Intent.createChooser(content,mime.startsWith("video/")?"Video auswählen":"Bild auswählen");
  Intent gallery=new Intent(Intent.ACTION_PICK);gallery.setDataAndType(mime.startsWith("video/")?MediaStore.Video.Media.EXTERNAL_CONTENT_URI:MediaStore.Images.Media.EXTERNAL_CONTENT_URI,mime);gallery.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
  ArrayList<Intent> choices=new ArrayList<>();
  for(android.content.pm.ResolveInfo info:getPackageManager().queryIntentActivities(gallery,0)){
   if(info.activityInfo!=null&&info.activityInfo.exported){Intent explicit=new Intent(gallery);explicit.setComponent(new android.content.ComponentName(info.activityInfo.packageName,info.activityInfo.name));choices.add(explicit);}
  }
  if(!choices.isEmpty())chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS,choices.toArray(new Intent[0]));
  return chooser;
 }
 private JSONObject json(String key,Object value){JSONObject result=new JSONObject();try{result.put(key,value);}catch(Exception ignored){}return result;}
 private JSONObject result(String id,String error){JSONObject value=json("requestId",id);try{value.put("error",error);}catch(Exception ignored){}return value;}
 private void emit(String event,JSONObject value){runOnUiThread(() -> {if(web!=null&&!isDestroyed()&&!isFinishing())web.evaluateJavascript("window.dispatchEvent(new CustomEvent("+JSONObject.quote(event)+",{detail:"+value.toString()+"}))",null);});}
 private void openCamera(String lens,String quality,String id){
  if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)camera.start(lens,quality,id);
  else{pendingCamera=new String[]{lens,quality,id};requestPermissions(new String[]{Manifest.permission.CAMERA},101);}
 }
 private WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
 @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){
  super.onRequestPermissionsResult(code,permissions,results);
  if(code==101&&pendingCamera!=null){String[] pending=pendingCamera;pendingCamera=null;if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)camera.start(pending[0],pending[1],pending[2]);else emit("zeitblick-camera-result",result(pending[2],"Erlaube die Kamera unter Android-Einstellungen → Apps → Zeitblick → Berechtigungen."));}
  if(code==100&&cameraRequest!=null){
   if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)cameraRequest.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});else cameraRequest.deny();
   cameraRequest=null;
  }
 }
 @Override protected void onActivityResult(int code,int result,Intent data){
  super.onActivityResult(code,result,data);
  if(code==200&&fileCallback!=null){fileCallback.onReceiveValue(result==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);fileCallback=null;}
  if(code==201){
   if(result!=RESULT_OK||data==null||data.getData()==null){pickingReference=false;emitReference(null,true,null);return;}
   Uri selected=data.getData();
   io.execute(() -> {
    JSONObject image=null;String error=null;
    try{image=references.decode(selected);}
    catch(OutOfMemoryError e){error="Für dieses Bild ist gerade zu wenig Speicher frei. Bitte versuche ein kleineres Bild.";}
    catch(Exception e){error="Das Bild konnte nicht geöffnet werden. JPG, PNG, WebP und HEIC/HEIF werden unterstützt; weitere Formate hängen von Android ab.";}
    final JSONObject ready=image;final String message=error;
    runOnUiThread(() -> {pickingReference=false;emitReference(ready,false,message);});
   });
  }
 }
 private void emitReference(JSONObject image,boolean cancelled,String error){
  JSONObject detail=image==null?new JSONObject():image;
  try{detail.put("requestId",referenceRequest);detail.put("cancelled",cancelled);if(error!=null)detail.put("error",error);}catch(JSONException ignored){}
  if(!isFinishing()&&!isDestroyed())web.evaluateJavascript("window.dispatchEvent(new CustomEvent('zeitblick-reference-result',{detail:"+detail.toString()+"}))",null);
 }
 private void pauseCamera(){if(camera!=null)camera.stop();if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('zeitblick-pause'))",null);}
 @Override protected void onPause(){
  // A runtime permission dialog must not cancel its own pending camera request.
  if(cameraRequest==null&&pendingCamera==null)pauseCamera();
  super.onPause();
 }
 @Override protected void onStop(){pauseCamera();super.onStop();}
 @Override protected void onResume(){super.onResume();if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('zeitblick-resume'))",null);}
 @Override public void onBackPressed(){
  web.evaluateJavascript("(function(){var d=document.querySelector('[role=dialog]');if(d){var b=d.querySelector('.back-button, .dialog-close, .sheet-heading button');if(b){b.click();return true}}return false})()", value -> {if(!"true".equals(value)) moveTaskToBack(true);});
 }
 @Override protected void onDestroy(){
  if(camera!=null)camera.destroy();
  if(cameraRequest!=null)cameraRequest.deny();
  if(fileCallback!=null)fileCallback.onReceiveValue(null);
  io.execute(() -> references.clear());io.shutdown(); if(web!=null){web.removeJavascriptInterface("ZeitblickAndroid");web.destroy();}
  super.onDestroy();
 }
 public final class PhotoStorage {
  @JavascriptInterface public void startCamera(String lens,String quality,String id){runOnUiThread(() -> openCamera(lens,quality,id));}
  @JavascriptInterface public void stopCamera(){runOnUiThread(() -> {pendingCamera=null;camera.stop();});}
  @JavascriptInterface public void capturePhoto(String id){runOnUiThread(() -> camera.capture(id));}
  @JavascriptInterface public void setExposure(int value){runOnUiThread(() -> camera.setExposure(value));}
  @JavascriptInterface public void setPreviewBounds(double x,double y,double width,double height,double density){runOnUiThread(() -> {
   if(!Double.isFinite(density)||density<=0||width<=0||height<=0)return;
   FrameLayout.LayoutParams params=new FrameLayout.LayoutParams(Math.max(1,(int)Math.round(width*density)),Math.max(1,(int)Math.round(height*density)));
   params.leftMargin=(int)Math.round(x*density);params.topMargin=(int)Math.round(y*density);texture.setLayoutParams(params);
  });}

  @JavascriptInterface public void pickReference(String requestId){runOnUiThread(() -> {
   if(pickingReference||isFinishing()||isDestroyed())return;
   pickingReference=true;referenceRequest=requestId;
   Intent choose=mediaChooser("image/*");
   try{startActivityForResult(choose,201);}catch(Exception e){pickingReference=false;emitReference(null,false,"Die Bildauswahl konnte nicht geöffnet werden.");}
  });}
  @JavascriptInterface public void releaseReference(String url){references.release(url);}
  @JavascriptInterface public void saveMedia(String payload){io.execute(() -> {
   String id="";Uri inserted=null;JSONObject response=new JSONObject();
   try{
    JSONObject message=new JSONObject(payload);id=message.getString("id");JSONArray images=message.getJSONArray("images");
    if(images.length()!=1)throw new IOException("Eine Mediendatei erwartet");
    JSONObject file=images.getJSONObject(0);String mime=file.getString("mime"),name=file.getString("name");
    String extension="image/gif".equals(mime)?"gif":"video/mp4".equals(mime)?"mp4":"video/webm".equals(mime)?"webm":null;
    if(extension==null||!name.matches("zeitblick-[A-Za-z0-9._-]+\\."+extension))throw new IOException("Unbekanntes Format");
    String encoded=file.getString("data");if(encoded.length()>80000000)throw new IOException("Datei zu groß");
    byte[] bytes=Base64.decode(encoded,Base64.DEFAULT);if(bytes.length<12)throw new IOException("Datei leer");
    boolean valid="gif".equals(extension)?bytes[0]=='G'&&bytes[1]=='I'&&bytes[2]=='F':
      "mp4".equals(extension)?bytes[4]=='f'&&bytes[5]=='t'&&bytes[6]=='y'&&bytes[7]=='p':
      (bytes[0]&255)==0x1a&&(bytes[1]&255)==0x45&&(bytes[2]&255)==0xdf&&(bytes[3]&255)==0xa3;
    if(!valid)throw new IOException("Ungültige Mediendatei");
    boolean video=mime.startsWith("video/");
    ContentValues values=new ContentValues();values.put(MediaStore.MediaColumns.DISPLAY_NAME,name);values.put(MediaStore.MediaColumns.MIME_TYPE,mime);values.put(MediaStore.MediaColumns.RELATIVE_PATH,video?"Movies/Zeitblick":"Pictures/Zeitblick");values.put(MediaStore.MediaColumns.IS_PENDING,1);
    inserted=getContentResolver().insert(video?MediaStore.Video.Media.EXTERNAL_CONTENT_URI:MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values);
    if(inserted==null)throw new IOException("Galerie nicht verfügbar");
    try(OutputStream out=getContentResolver().openOutputStream(inserted)){if(out==null)throw new IOException("Speicher nicht verfügbar");out.write(bytes);}
    ContentValues ready=new ContentValues();ready.put(MediaStore.MediaColumns.IS_PENDING,0);getContentResolver().update(inserted,ready,null,null);response.put("success",true);
   }catch(Exception error){if(inserted!=null){try{getContentResolver().delete(inserted,null,null);}catch(Exception ignored){}}try{response.put("success",false);response.put("error","GIF oder Video konnte nicht gespeichert werden. Bitte Speicherplatz und Format prüfen.");}catch(JSONException ignored){}}
   try{response.put("id",id);}catch(JSONException ignored){}emit("zeitblick-save-result",response);
  });}
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
