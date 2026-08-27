export function rendererHandConfig(handMode = "marker") {
  const normalizedMode = handMode === true ? "marker" : handMode === false ? "none" : handMode;
  return {
    enabled: normalizedMode !== "none",
    style: normalizedMode,
    height: normalizedMode === "pen" ? 420 : 470,
    anchor: [0, 0],
  };
}
