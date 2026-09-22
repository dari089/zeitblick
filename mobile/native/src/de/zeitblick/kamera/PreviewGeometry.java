package de.zeitblick.kamera;

/** TextureView already applies sensor orientation. Undo its stretch, then
 * compensate only display rotation and center-crop with one pixel scale.
 * Platform behavior: https://developer.android.com/media/camera/camera2/camera-preview#textureview
 */
final class PreviewGeometry {
 static float[] transform(int bufferWidth,int bufferHeight,int sensorDegrees,int displayDegrees,int viewWidth,int viewHeight) {
  if(bufferWidth<=0||bufferHeight<=0||viewWidth<=0||viewHeight<=0)throw new IllegalArgumentException("Empty preview");
  boolean sensorSwaps=sensorDegrees%180!=0;
  float naturalWidth=sensorSwaps?bufferHeight:bufferWidth;
  float naturalHeight=sensorSwaps?bufferWidth:bufferHeight;
  boolean displaySwaps=displayDegrees%180!=0;
  float displayedWidth=displaySwaps?naturalHeight:naturalWidth;
  float displayedHeight=displaySwaps?naturalWidth:naturalHeight;
  float cover=Math.max(viewWidth/displayedWidth,viewHeight/displayedHeight);
  return new float[]{naturalWidth/viewWidth*cover,naturalHeight/viewHeight*cover,-displayDegrees};
 }
}
