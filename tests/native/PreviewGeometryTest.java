package de.zeitblick.kamera;
public final class PreviewGeometryTest {
 static void near(double a,double b){if(Math.abs(a-b)>0.001)throw new AssertionError(a+" != "+b);}
 public static void main(String[] args){
  // Portrait phone, landscape sensor: TextureView has ALREADY rotated the pixels.
  float[] portrait=PreviewGeometry.transform(1920,1080,90,0,1080,1920);
  near(portrait[0],1);near(portrait[1],1);near(portrait[2],0);
  int count=0;
  for(int sensor:new int[]{0,90,180,270})for(int display:new int[]{0,90,180,270})
   for(int[] pane:new int[][]{{1080,1920},{1920,1080},{358,1012},{716,1012},{800,800}})
    for(int[] buffer:new int[][]{{1920,1080},{1440,1080}}){
     float[] t=PreviewGeometry.transform(buffer[0],buffer[1],sensor,display,pane[0],pane[1]);
     double nw=sensor%180==0?buffer[0]:buffer[1],nh=sensor%180==0?buffer[1]:buffer[0];
     // Total scale of equal-length horizontal/vertical features after the
     // platform's implicit fit and the app's transform must be identical.
     double pixelX=pane[0]/nw*t[0],pixelY=pane[1]/nh*t[1];
     near(pixelX,pixelY);near(t[2],-display);
     double width=display%180==0?nw*pixelX:nh*pixelY;
     double height=display%180==0?nh*pixelY:nw*pixelX;
     if(width+0.001<pane[0]||height+0.001<pane[1])throw new AssertionError("Unfilled viewfinder");
     if(Math.min(Math.abs(width-pane[0]),Math.abs(height-pane[1]))>0.001)throw new AssertionError("Excess crop");
     count++;
    }
  System.out.println("Passed "+count+" sensor/display/buffer/pane cases; portrait has no extra rotation.");
 }
}
