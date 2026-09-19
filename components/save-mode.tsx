"use client";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { SaveMode } from "@/lib/photo-types";

export function SaveModeControl({ value, onChange, hasOverlay, id }: { value: SaveMode; onChange: (value: SaveMode) => void; hasOverlay: boolean; id: string }) {
  return <RadioGroup className="save-mode" value={hasOverlay ? value : "clean"} onValueChange={value => onChange(value as SaveMode)} aria-label="Zu speichernde Fotos">
    {([['clean', 'Ohne Overlay'], ['overlay', 'Mit Overlay'], ['both', 'Beide']] as const).map(([mode, label]) => <label key={mode} className={`save-choice ${!hasOverlay && mode !== 'clean' ? 'disabled' : ''}`} htmlFor={`${id}-${mode}`}><RadioGroupItem id={`${id}-${mode}`} value={mode} disabled={!hasOverlay && mode !== 'clean'} /><span>{label}</span></label>)}
  </RadioGroup>;
}
