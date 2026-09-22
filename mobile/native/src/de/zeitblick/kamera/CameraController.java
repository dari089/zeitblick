package de.zeitblick.kamera;

import android.app.Activity;
import android.content.Context;
import android.graphics.*;
import android.hardware.camera2.*;
import android.hardware.camera2.params.*;
import android.media.Image;
import android.media.ImageReader;
import android.os.*;
import android.util.*;
import android.view.*;
import org.json.*;
import java.util.*;
import java.nio.ByteBuffer;

/** Native camera preview/capture. The WebView only draws controls/reference. */
final class CameraController implements TextureView.SurfaceTextureListener {
 interface Listener {
  void cameras(JSONArray choices);
  void zoom(JSONObject value);
  void ready(String request,JSONObject camera);
  void error(String request,String message);
  void photo(String request,byte[] jpeg);
  void photoError(String request,String message);
 }
 private static final class Lens {
  String key,device,physical,label;CameraCharacteristics info;
  Lens(String device,String physical,CameraCharacteristics info,String label){this.device=device;this.physical=physical;this.info=info;this.label=label;key=device+(physical==null?"":"/"+physical);}
 }
 private final Activity activity;
 private final TextureView texture;
 private final CameraManager manager;
 private final android.hardware.display.DisplayManager displays;
 private final android.hardware.display.DisplayManager.DisplayListener displayListener=new android.hardware.display.DisplayManager.DisplayListener(){
  public void onDisplayAdded(int id){}
  public void onDisplayRemoved(int id){}
  public void onDisplayChanged(int id){configureTransform();}
 };
 private final Listener listener;
 private final Handler main=new Handler(Looper.getMainLooper());
 private final HandlerThread imageThread=new HandlerThread("ZeitblickPhotos");
 private final Handler images;
 private final LinkedHashMap<String,Lens> lenses=new LinkedHashMap<>();
 private CameraDevice device;
 private CameraCaptureSession session;
 private CaptureRequest.Builder preview;
 private ImageReader reader;
 private Surface previewSurface;
 private Size previewSize,jpegSize;
 private Lens lens;
 private int generation,exposure;
 private float zoom=1f;
 private CameraCharacteristics controlInfo;
 private boolean wanted;
 private String requestedLens="",profile="smooth",request="";
 private volatile String photoRequest;

 CameraController(Activity activity,TextureView texture,Listener listener){
  this.activity=activity;this.texture=texture;this.listener=listener;
  manager=(CameraManager)activity.getSystemService(Context.CAMERA_SERVICE);
  displays=(android.hardware.display.DisplayManager)activity.getSystemService(Context.DISPLAY_SERVICE);
  displays.registerDisplayListener(displayListener,main);
  imageThread.start();images=new Handler(imageThread.getLooper());
  texture.setSurfaceTextureListener(this);
 }
 private static boolean hasJpeg(CameraCharacteristics info){StreamConfigurationMap map=info.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);return map!=null&&map.getOutputSizes(ImageFormat.JPEG)!=null&&map.getOutputSizes(SurfaceTexture.class)!=null;}
 private double equivalent(CameraCharacteristics info){
  float[] f=info.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);SizeF size=info.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE);
  return f!=null&&f.length>0&&size!=null?f[0]*43.2666/Math.hypot(size.getWidth(),size.getHeight()):0;
 }
 private String label(CameraCharacteristics info,boolean automatic){
  Integer facing=info.get(CameraCharacteristics.LENS_FACING);
  float[] focal=info.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);
  SizeF sensor=info.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE);
  double equivalent=focal!=null&&focal.length>0&&sensor!=null?focal[0]*43.2666/Math.hypot(sensor.getWidth(),sensor.getHeight()):0;
  String side=facing!=null&&facing==CameraCharacteristics.LENS_FACING_FRONT?"Frontkamera":equivalent>0&&equivalent<20?"Ultraweitwinkel":equivalent>=40?"Telekamera":"Hauptkamera";
  return side+(equivalent>0?" · "+Math.round(equivalent)+" mm":"")+(automatic?" · Auto":"");
 }
 private void discover() throws CameraAccessException,JSONException {
  lenses.clear();
  Set<String> publicIds=new HashSet<>(Arrays.asList(manager.getCameraIdList()));
  for(String id:manager.getCameraIdList()){
   CameraCharacteristics info=manager.getCameraCharacteristics(id);if(!hasJpeg(info))continue;
   Set<String> physical=info.getPhysicalCameraIds();
   Lens logical=new Lens(id,null,info,label(info,!physical.isEmpty()));lenses.put(logical.key,logical);
   for(String physicalId:physical){
    if(publicIds.contains(physicalId))continue;
    try{CameraCharacteristics data=manager.getCameraCharacteristics(physicalId);if(hasJpeg(data)){Lens item=new Lens(id,physicalId,data,label(data,false));lenses.put(item.key,item);}}catch(CameraAccessException|IllegalArgumentException ignored){}
   }
  }
  JSONArray result=new JSONArray();
  for(Lens item:lenses.values()){
   JSONObject entry=new JSONObject();entry.put("id",item.key);entry.put("label",item.label);entry.put("equivalent",equivalent(item.info));
   Integer facing=item.info.get(CameraCharacteristics.LENS_FACING);entry.put("facing",facing!=null&&facing==CameraCharacteristics.LENS_FACING_FRONT?"user":"environment");result.put(entry);
  }
  listener.cameras(result);
 }
 void start(String selected,String quality,String token){
  stop();wanted=true;requestedLens=selected==null?"":selected;profile=quality;request=token;
  if(texture.isAvailable())open();
 }
 private void open(){
  if(!wanted)return;
  final int current=++generation;
  try{
   discover();lens=lenses.get(requestedLens);
   if(lens==null){double best=Double.MAX_VALUE;for(Lens item:lenses.values()){Integer facing=item.info.get(CameraCharacteristics.LENS_FACING);if(facing!=null&&facing==CameraCharacteristics.LENS_FACING_BACK){double eq=equivalent(item.info),score=(eq>0?Math.abs(eq-24):100)+(item.physical==null?0:1);if(score<best){best=score;lens=item;}}}}
   if(lens==null&&!lenses.isEmpty())lens=lenses.values().iterator().next();
   if(lens==null)throw new IllegalStateException("Keine Kamera verfügbar");
   StreamConfigurationMap map=lens.info.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
   controlInfo=manager.getCameraCharacteristics(lens.device);zoom=1f;
   jpegSize=chooseJpeg(map.getOutputSizes(ImageFormat.JPEG),4000);
   previewSize=choosePreview(map.getOutputSizes(SurfaceTexture.class),jpegSize);
   SurfaceTexture surface=texture.getSurfaceTexture();if(surface==null)return;
   surface.setDefaultBufferSize(previewSize.getWidth(),previewSize.getHeight());previewSurface=new Surface(surface);configureTransform();
   reader=ImageReader.newInstance(jpegSize.getWidth(),jpegSize.getHeight(),ImageFormat.JPEG,2);
   reader.setOnImageAvailableListener(source -> {
    try(Image image=source.acquireNextImage()){
     if(image==null)return;String token=photoRequest;if(token==null)return;
     ByteBuffer buffer=image.getPlanes()[0].getBuffer();byte[] bytes=new byte[buffer.remaining()];buffer.get(bytes);
     main.post(() -> {if(current==generation&&token.equals(photoRequest)){photoRequest=null;listener.photo(token,bytes);}});
    }catch(Exception e){main.post(() -> {if(current==generation)failPhoto("Das Foto konnte nicht gelesen werden.");});}
   },images);
   manager.openCamera(lens.device,new CameraDevice.StateCallback(){
    @Override public void onOpened(CameraDevice camera){if(current!=generation||!wanted){camera.close();return;}device=camera;configureSession(current);}
    @Override public void onDisconnected(CameraDevice camera){camera.close();if(current==generation)fail("Die Kamera wurde getrennt. Bitte erneut versuchen.");}
    @Override public void onError(CameraDevice camera,int error){camera.close();if(current==generation)fail("Diese Linse ist gerade nicht verfügbar. Wähle eine andere Linse oder schließe andere Kamera-Apps.");}
   },main);
  }catch(Exception e){fail("Die ausgewählte Linse konnte nicht geöffnet werden. Wähle eine andere Linse und versuche es erneut.");}
 }
 private static Size chooseJpeg(Size[] sizes,int target){
  Size best=sizes[0];double score=Double.MAX_VALUE;
  for(Size size:sizes){double s=Math.abs(Math.log((double)Math.max(size.getWidth(),size.getHeight())/target));if((long)size.getWidth()*size.getHeight()>13000000)s+=3;if(s<score){score=s;best=size;}}
  return best;
 }
 private Size choosePreview(Size[] sizes,Size photo){
  Size best=sizes[0];double score=Double.MAX_VALUE,ratio=(double)photo.getWidth()/photo.getHeight();
  for(Size size:sizes){double s=Math.abs((double)size.getWidth()/size.getHeight()-ratio)*100+Math.abs(Math.log((double)Math.max(size.getWidth(),size.getHeight())/("smooth".equals(profile)?1280:1920)));if(Math.max(size.getWidth(),size.getHeight())>1920)s+=10;if(s<score){score=s;best=size;}}
  return best;
 }
 private void configureSession(final int current){
  try{
   OutputConfiguration live=new OutputConfiguration(previewSurface),photo=new OutputConfiguration(reader.getSurface());
   if(lens.physical!=null){live.setPhysicalCameraId(lens.physical);photo.setPhysicalCameraId(lens.physical);}
   device.createCaptureSessionByOutputConfigurations(Arrays.asList(live,photo),new CameraCaptureSession.StateCallback(){
    @Override public void onConfigured(CameraCaptureSession configured){
     if(current!=generation||device==null){configured.close();return;}
     session=configured;
     try{
      exposure=0;preview=device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);preview.addTarget(previewSurface);controls(preview);
      session.setRepeatingRequest(preview.build(),null,main);
      listener.ready(request,metadata());
     }catch(Exception e){fail("Das Kamerabild konnte nicht gestartet werden.");}
    }
    @Override public void onConfigureFailed(CameraCaptureSession failed){if(current==generation)fail("Android unterstützt diese Linse nicht mit Fotoaufnahme. Bitte wähle eine andere Linse.");}
   },main);
  }catch(Exception e){fail("Diese Kamera-Konfiguration ist nicht verfügbar. Bitte wähle eine andere Linse.");}
 }
 private int rotation(){
  int display=activity.getWindowManager().getDefaultDisplay().getRotation()*90;
  Integer sensor=lens==null?0:lens.info.get(CameraCharacteristics.SENSOR_ORIENTATION);
  Integer facing=lens==null?null:lens.info.get(CameraCharacteristics.LENS_FACING);
  return ((sensor==null?0:sensor)+(facing!=null&&facing==CameraCharacteristics.LENS_FACING_FRONT?display:-display)+360)%360;
 }
 private void configureTransform(){
  if(previewSize==null||texture.getWidth()==0||texture.getHeight()==0)return;
  Integer sensor=lens==null?0:lens.info.get(CameraCharacteristics.SENSOR_ORIENTATION);
  int display=texture.getDisplay()==null?0:texture.getDisplay().getRotation()*90;
  float[] transform=PreviewGeometry.transform(previewSize.getWidth(),previewSize.getHeight(),sensor==null?0:sensor,display,texture.getWidth(),texture.getHeight());
  float cx=texture.getWidth()/2f,cy=texture.getHeight()/2f;
  Matrix matrix=new Matrix();
  matrix.setScale(transform[0],transform[1],cx,cy);
  matrix.postRotate(transform[2],cx,cy);
  texture.setTransform(matrix);
 }
 private Range<Integer> exposureRange(){Range<Integer> range=lens.info.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE);return range==null?new Range<>(0,0):range;}
 private void controls(CaptureRequest.Builder builder){
  builder.set(CaptureRequest.CONTROL_MODE,CaptureRequest.CONTROL_MODE_AUTO);builder.set(CaptureRequest.CONTROL_AE_MODE,CaptureRequest.CONTROL_AE_MODE_ON);
  int[] focus=lens.info.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES);
  if(focus!=null)for(int value:focus)if(value==CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE){builder.set(CaptureRequest.CONTROL_AF_MODE,value);break;}
  builder.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION,exposureRange().clamp(exposure));
  applyZoom(builder);
  Range<Integer>[] fps=lens.info.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES);Range<Integer> chosen=null;
  if(fps!=null)for(Range<Integer> range:fps)if(range.getUpper()<=30&&(chosen==null||range.getUpper()>chosen.getUpper()||(range.getUpper().equals(chosen.getUpper())&&range.getLower()<chosen.getLower())))chosen=range;
  if(chosen!=null)builder.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,chosen);
 }
 private JSONObject metadata() throws JSONException {
  JSONObject value=new JSONObject();boolean swap=rotation()%180!=0;
  value.put("id",lens.key);value.put("width",swap?jpegSize.getHeight():jpegSize.getWidth());value.put("height",swap?jpegSize.getWidth():jpegSize.getHeight());
  value.put("zoomMin",zoomRange().getLower());value.put("zoomMax",zoomRange().getUpper());value.put("zoom",zoom);
  value.put("exposureMin",exposureRange().getLower());value.put("exposureMax",exposureRange().getUpper());
  Rational step=lens.info.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_STEP);value.put("exposureStep",step==null?0:step.doubleValue());
  Integer facing=lens.info.get(CameraCharacteristics.LENS_FACING);value.put("facing",facing!=null&&facing==CameraCharacteristics.LENS_FACING_FRONT?"user":"environment");return value;
 }
 private Range<Float> zoomRange(){
  if(controlInfo==null)return new Range<>(1f,1f);
  // A forced physical output has a different sensor coordinate system. Only
  // crop it when this device explicitly exposes the physical request key.
  if(lens.physical!=null){
   List<CaptureRequest.Key<?>> keys=controlInfo.getAvailablePhysicalCameraRequestKeys();
   if(keys==null||!keys.contains(CaptureRequest.SCALER_CROP_REGION))return new Range<>(1f,1f);
  }else if(Build.VERSION.SDK_INT>=30){Range<Float> range=controlInfo.get(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE);if(range!=null)return range;}
  Float max=lens.info.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM);
  return new Range<>(1f,max==null?1f:Math.max(1f,max));
 }
 private void applyZoom(CaptureRequest.Builder builder){
  if(lens.physical==null&&Build.VERSION.SDK_INT>=30&&controlInfo.get(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE)!=null){builder.set(CaptureRequest.CONTROL_ZOOM_RATIO,zoom);return;}
  if(zoomRange().getUpper()<=1f)return;
  Rect active=lens.info.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE);if(active==null)return;
  int width=Math.max(2,(int)(active.width()/zoom)),height=Math.max(2,(int)(active.height()/zoom));
  Rect crop=new Rect(active.left+(active.width()-width)/2,active.top+(active.height()-height)/2,active.left+(active.width()-width)/2+width,active.top+(active.height()-height)/2+height);
  if(lens.physical==null)builder.set(CaptureRequest.SCALER_CROP_REGION,crop);else builder.setPhysicalCameraKey(CaptureRequest.SCALER_CROP_REGION,crop,lens.physical);
 }
 void setZoom(float value){
  if(session==null||preview==null||lens==null||Float.isNaN(value)||Float.isInfinite(value))return;
  float previous=zoom;zoom=zoomRange().clamp(value);
  try{applyZoom(preview);session.setRepeatingRequest(preview.build(),null,main);listener.zoom(metadata());}
  catch(Exception e){zoom=previous;try{applyZoom(preview);JSONObject result=metadata();result.put("error","Zoom konnte nicht geändert werden.");listener.zoom(result);}catch(Exception ignored){}}
 }
 void setExposure(int value){
  if(session==null||preview==null||lens==null)return;exposure=exposureRange().clamp(value);
  try{controls(preview);session.setRepeatingRequest(preview.build(),null,main);}catch(Exception e){listener.error(request,"Die Belichtung konnte nicht geändert werden.");}
 }
 void capture(String token){
  if(session==null||device==null||reader==null){listener.photoError(token,"Die Kamera ist noch nicht bereit.");return;}
  if(photoRequest!=null){listener.photoError(token,"Eine Aufnahme wird bereits erstellt.");return;}
  photoRequest=token;
  try{
   CaptureRequest.Builder still=device.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);still.addTarget(reader.getSurface());controls(still);
   int[] noise=lens.info.get(CameraCharacteristics.NOISE_REDUCTION_AVAILABLE_NOISE_REDUCTION_MODES);
   if(noise!=null)for(int mode:noise)if(mode==CaptureRequest.NOISE_REDUCTION_MODE_HIGH_QUALITY){still.set(CaptureRequest.NOISE_REDUCTION_MODE,mode);break;}
   int[] edges=lens.info.get(CameraCharacteristics.EDGE_AVAILABLE_EDGE_MODES);
   if(edges!=null)for(int mode:edges)if(mode==CaptureRequest.EDGE_MODE_HIGH_QUALITY){still.set(CaptureRequest.EDGE_MODE,mode);break;}
   still.set(CaptureRequest.JPEG_ORIENTATION,rotation());still.set(CaptureRequest.JPEG_QUALITY,(byte)96);
   session.capture(still.build(),new CameraCaptureSession.CaptureCallback(){
    @Override public void onCaptureFailed(CameraCaptureSession session,CaptureRequest capture,CaptureFailure failure){if(token.equals(photoRequest))failPhoto("Die Aufnahme ist fehlgeschlagen. Bitte erneut versuchen.");}
   },main);
   main.postDelayed(() -> {if(token.equals(photoRequest))failPhoto("Die Kamera hat kein Foto geliefert. Bitte erneut versuchen.");},15000);
  }catch(Exception e){failPhoto("Das Foto konnte nicht aufgenommen werden.");}
 }
 private void failPhoto(String message){String token=photoRequest;photoRequest=null;if(token!=null)listener.photoError(token,message);}
 private void fail(String message){String token=request;stop();listener.error(token,message);}
 void stop(){
  generation++;wanted=false;failPhoto("Die Aufnahme wurde unterbrochen.");
  if(session!=null){session.close();session=null;}if(device!=null){device.close();device=null;}if(reader!=null){reader.close();reader=null;}if(previewSurface!=null){previewSurface.release();previewSurface=null;}preview=null;
 }
 void destroy(){displays.unregisterDisplayListener(displayListener);stop();imageThread.quitSafely();}
 @Override public void onSurfaceTextureAvailable(SurfaceTexture surface,int width,int height){if(wanted)open();}
 @Override public void onSurfaceTextureSizeChanged(SurfaceTexture surface,int width,int height){configureTransform();}
 @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture surface){stop();return true;}
 @Override public void onSurfaceTextureUpdated(SurfaceTexture surface){}
}
