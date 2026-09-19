"use client";
import { Slider } from "@/components/ui/slider";
export function LabeledSlider(props: React.ComponentProps<typeof Slider>) {
  return <Slider {...props} ref={node => {
    const thumb = node?.querySelector('[role="slider"]');
    if (thumb && props["aria-labelledby"]) thumb.setAttribute("aria-labelledby", String(props["aria-labelledby"]));
  }} />;
}
