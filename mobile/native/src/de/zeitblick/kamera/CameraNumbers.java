package de.zeitblick.kamera;

/** Optional vendor metadata must never break the JSON camera-ready event. */
final class CameraNumbers {
 static double finiteOr(double value,double fallback){return Double.isNaN(value)||Double.isInfinite(value)?fallback:value;}
 static boolean validZoom(float min,float max){return finiteOr(min,0)>0&&finiteOr(max,0)>=min;}
}
