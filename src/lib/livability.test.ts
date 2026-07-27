import { describe, expect, it } from "vitest";
import {
  accessScore,
  classifyOsmTags,
  deriveLivability,
} from "../../scripts/lib/livability.mjs";

describe("livability access scoring", () => {
  it("rewards proximity and returns null when nothing is mapped", () => {
    expect(accessScore(80, 3, { near: 150, far: 1200 })).toBe(10);
    expect(accessScore(1300, 0, { near: 150, far: 1200 })).toBe(1);
    expect(accessScore(null, 0, { near: 150, far: 1200 })).toBeNull();
  });

  it("captures police station distance as a factual feature (not scored)", () => {
    const center = [77.64, 12.912];
    const nearPolice = [77.6405, 12.9122];
    const result = deriveLivability(
      center,
      { education: [], healthcare: [], transit: [], metro: [], dailyNeeds: [], police: [nearPolice] },
      [],
    );
    expect(result.features.distanceToPoliceMeters).toBeGreaterThan(0);
    // Police distance is a factual context feature, never included in scores.
    expect("safetyProxy" in result.scores).toBe(false);
  });

  it("classifies OSM tags into livability categories", () => {
    expect(classifyOsmTags({ amenity: "school" })).toBe("education");
    expect(classifyOsmTags({ amenity: "hospital" })).toBe("healthcare");
    expect(classifyOsmTags({ shop: "supermarket" })).toBe("dailyNeeds");
    expect(classifyOsmTags({ highway: "bus_stop" })).toBe("transit");
    expect(classifyOsmTags({ amenity: "police" })).toBe("police");
    expect(classifyOsmTags({ railway: "station", station: "subway" })).toBe("metro");
    expect(classifyOsmTags({ building: "yes" })).toBeNull();
  });

  it("derives per-cell features and scores from categorised points", () => {
    const center = [77.64, 12.912];
    const near = [77.6405, 12.9122];
    const result = deriveLivability(
      center,
      { education: [near], healthcare: [], transit: [near], metro: [], dailyNeeds: [near], police: [] },
      [],
    );
    expect(result.features.distanceToSchoolMeters).toBeGreaterThan(0);
    expect(result.scores.education).toBeGreaterThan(0);
    expect(result.scores.healthcare).toBeNull();
    expect(result.scores.greenSpace).toBeNull();
  });
});
