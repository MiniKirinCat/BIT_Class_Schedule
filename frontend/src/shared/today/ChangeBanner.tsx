interface ChangeBannerProps {
  count: number;
  onClick: () => void;
}

export function ChangeBanner({ count, onClick }: ChangeBannerProps) {
  return (
    <button type="button" className="change-banner" onClick={onClick}>
      <span>有 {count} 条新变动</span>
      <span className="change-banner-badge">{count}</span>
    </button>
  );
}
