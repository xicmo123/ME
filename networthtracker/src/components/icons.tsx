export const GoogleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.5 5.1 29.5 3 24 3 15.6 3 8.4 7.8 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 45c5.4 0 10.3-2.1 14-5.5l-6.5-5.4c-2 1.6-4.6 2.9-7.5 2.9-5.3 0-9.7-3.4-11.3-8l-6.6 5.1C9.6 40.2 16.3 45 24 45z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.5 5.4C39.9 37.4 43 31.4 43 24c0-1.2-.1-2.4-.4-3.5z" />
  </svg>
);

const CURRENCY_FLAGS: Record<string, string> = {
  TWD: "🇹🇼",
  USD: "🇺🇸",
  JPY: "🇯🇵",
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  HKD: "🇭🇰",
  CNY: "🇨🇳",
  AUD: "🇦🇺",
  CAD: "🇨🇦",
  SGD: "🇸🇬",
};

export const CurrencyFlag = ({ currency, className }: { currency: string; className?: string }) => (
  <span className={className} role="img" aria-label={`${currency} flag`}>
    {CURRENCY_FLAGS[currency] ?? "🏳️"}
  </span>
);

export const AppleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 384 512" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
  </svg>
);
