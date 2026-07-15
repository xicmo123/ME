// 淨資產主卡配色方案，也共用給其他想呼應主視覺的卡片（例如方案升級卡）
export const HERO_THEMES = {
  cream: {
    background: "linear-gradient(135deg, #F0DFB0 0%, #DFC583 50%, #C9A659 100%)",
    text: "#3B2E12",
    shadow: "0 18px 38px -16px rgba(201,166,89,0.5)",
    ring: "inset 0 1px 0 rgba(255,255,255,0.45), inset 0 0 0 1px rgba(59,46,18,0.1)",
    chipBtnBg: "#3B2E120F",
    chipBtnBgHover: "#3B2E1220",
    plusBg: "#3B2E12",
    plusText: "#F0DFB0",
    assetBorder: "#244A30",
    liabilityBorder: "#6E2A20",
    toggleActiveBg: "#3B2E12",
    toggleActiveText: "#F0DFB0",
    toggleIdleBorder: "#3B2E124D",
    toggleIdleBg: "#3B2E120F",
    toggleIdleText: "#3B2E12",
  },
  noir: {
    background: "linear-gradient(135deg, #262010 0%, #1C1F1A 55%, #14150F 100%)",
    text: "#E8C874",
    shadow: "0 18px 38px -16px rgba(0,0,0,0.6)",
    ring: "inset 0 1px 0 rgba(232,200,116,0.25), inset 0 0 0 1px rgba(232,200,116,0.25)",
    chipBtnBg: "#E8C8741A",
    chipBtnBgHover: "#E8C87433",
    plusBg: "#E8C874",
    plusText: "#1C1F1A",
    assetBorder: "#4F7B5E",
    liabilityBorder: "#A24936",
    toggleActiveBg: "#E8C874",
    toggleActiveText: "#1C1F1A",
    toggleIdleBorder: "#E8C8744D",
    toggleIdleBg: "#E8C8741A",
    toggleIdleText: "#E8C874",
  },
} as const;

export type HeroThemeName = keyof typeof HERO_THEMES;
