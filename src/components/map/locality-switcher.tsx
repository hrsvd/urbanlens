"use client";

import { MapPin } from "lucide-react";
import { LOCALITIES } from "@/lib/constants";
import type { LocalityId } from "@/lib/constants";
import { useMapStore } from "@/lib/store";

type LocalitySwitcherProps = {
  availableLocalities: LocalityId[];
};

export function LocalitySwitcher({ availableLocalities }: LocalitySwitcherProps) {
  const activeLocality = useMapStore((state) => state.activeLocality);
  const setActiveLocality = useMapStore((state) => state.setActiveLocality);

  return (
    <div className="locality-switcher" role="navigation" aria-label="Switch locality">
      <span className="locality-switcher-label" aria-hidden="true">
        <MapPin size={11} />
        AREA
      </span>
      <div className="locality-chip-list" role="tablist" aria-label="Available localities">
        {availableLocalities.map((id) => {
          const config = LOCALITIES[id];
          const isActive = id === activeLocality;
          return (
            <button
              key={id}
              role="tab"
              className={`locality-chip${isActive ? " active" : ""}`}
              aria-selected={isActive}
              aria-label={`Switch to ${config.displayName}`}
              onClick={() => {
                if (!isActive) setActiveLocality(id);
              }}
            >
              {config.displayName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
