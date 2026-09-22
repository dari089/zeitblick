package de.zeitblick.kamera;
public final class CameraNumbersTest {
 public static void main(String[] args){
  double[] invalid={Double.NaN,Double.POSITIVE_INFINITY,Double.NEGATIVE_INFINITY,0.0/0.0};
  for(double value:invalid)if(CameraNumbers.finiteOr(value,0)!=0)throw new AssertionError("Invalid metadata must serialize as zero");
  if(Math.abs(CameraNumbers.finiteOr(1.0/3,0)-1.0/3)>1e-10)throw new AssertionError("Valid EV step must survive");
  if(!CameraNumbers.validZoom(.6f,10f))throw new AssertionError("Optical zoom-out range rejected");
  for(float[] r:new float[][]{{Float.NaN,10},{1,Float.POSITIVE_INFINITY},{0,10},{2,1}})if(CameraNumbers.validZoom(r[0],r[1]))throw new AssertionError("Invalid zoom range accepted");
  System.out.println("Camera metadata regression checks passed");
 }
}
