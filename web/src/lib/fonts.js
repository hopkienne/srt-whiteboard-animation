export const FONT_FAMILIES = [
  { value: "Times New Roman", label: "Times New Roman", supportsStyles: true },
  { value: "Patrick Hand", label: "Patrick Hand", supportsStyles: false },
  { value: "serif", label: "Serif tương thích", supportsStyles: true },
];

const FONT_STYLES = new Set(["regular", "bold", "italic", "boldItalic"]);

export function supportsFontStyles(fontFamily) {
  return FONT_FAMILIES.find(({ value }) => value === fontFamily)?.supportsStyles !== false;
}

export function normalizeFontStyle(fontFamily, fontStyle = "regular") {
  if (!supportsFontStyles(fontFamily)) return "regular";
  return FONT_STYLES.has(fontStyle) ? fontStyle : "regular";
}
