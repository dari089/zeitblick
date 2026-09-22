package de.zeitblick.kamera;

/** Bound decode memory without cropping, stretching or enlarging a reference. */
final class ImageSizing {
 static int[] fit(int width,int height) {
  if(width<=0||height<=0)throw new IllegalArgumentException("Invalid image dimensions");
  double scale=Math.min(1d,Math.min(3072d/Math.max(width,height),Math.sqrt(6000000d/((double)width*height))));
  return new int[]{Math.max(1,(int)Math.floor(width*scale)),Math.max(1,(int)Math.floor(height*scale))};
 }
}
