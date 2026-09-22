package de.zeitblick.kamera;

import android.content.ContentResolver;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.ColorSpace;
import android.graphics.ImageDecoder;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.webkit.WebResourceResponse;
import org.json.JSONObject;
import java.io.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** Decode selected images on the IO executor, never on the UI/JS thread. */
final class ReferenceImages {
 private final ContentResolver resolver;
 private final File directory;
 private final Map<String,File> files = new ConcurrentHashMap<>();
 private static final String PREFIX = "https://appassets.androidplatform.net/reference/";

 ReferenceImages(ContentResolver resolver, File cache) {
  this.resolver = resolver;
  directory = new File(cache,"references"); directory.mkdirs();
  File[] stale = directory.listFiles(); if(stale!=null) for(File file:stale) file.delete();
 }

 JSONObject decode(Uri uri) throws Exception {
  String name = "Vorlage";
  try(Cursor cursor=resolver.query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)) {
   if(cursor!=null&&cursor.moveToFirst()&&!cursor.isNull(0)) name=cursor.getString(0);
  }catch(RuntimeException ignored){}
  Bitmap bitmap = ImageDecoder.decodeBitmap(ImageDecoder.createSource(resolver,uri),(decoder,info,source) -> {
   int[] size = ImageSizing.fit(info.getSize().getWidth(),info.getSize().getHeight());
   decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
   decoder.setTargetColorSpace(ColorSpace.get(ColorSpace.Named.SRGB));
   decoder.setTargetSize(size[0],size[1]);
  });
  File output=null;
  try {
   boolean alpha=bitmap.hasAlpha();
   String token=UUID.randomUUID().toString()+(alpha?".png":".jpg");
   output=new File(directory,token);
   try(OutputStream stream=new FileOutputStream(output)) {
    if(!bitmap.compress(alpha?Bitmap.CompressFormat.PNG:Bitmap.CompressFormat.JPEG,95,stream)) throw new IOException("Bild konnte nicht vorbereitet werden");
   }
   JSONObject result=new JSONObject(); result.put("url",PREFIX+token); result.put("name",name);
   result.put("width",bitmap.getWidth()); result.put("height",bitmap.getHeight());
   files.put(token,output); return result;
  } catch(Exception error) {if(output!=null)output.delete();throw error;}
  finally {bitmap.recycle();}
 }

 String storeJpeg(byte[] bytes) throws IOException {
  String token=UUID.randomUUID().toString()+".jpg";File file=new File(directory,token);
  try(OutputStream stream=new FileOutputStream(file)){stream.write(bytes);}catch(IOException error){file.delete();throw error;}
  files.put(token,file);return PREFIX+token;
 }
 WebResourceResponse serve(String token) throws IOException {
  File file=files.get(token);
  if(file==null) throw new FileNotFoundException();
  return new WebResourceResponse(token.endsWith(".png")?"image/png":"image/jpeg",null,200,"OK",Collections.singletonMap("Cache-Control","no-store"),new FileInputStream(file));
 }

 void release(String url) {
  if(url==null||!url.startsWith(PREFIX)) return;
  File file=files.remove(url.substring(PREFIX.length()));
  if(file!=null)file.delete();
 }
 void clear() {for(File file:files.values())file.delete();files.clear();}
}
