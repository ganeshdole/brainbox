/** The landing page's faint grid, fading out from the centre. */
export function Grid() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
        backgroundSize: "80px 80px",
        maskImage: "radial-gradient(ellipse 60% 55% at 50% 50%, #000 20%, transparent 75%)",
        WebkitMaskImage: "radial-gradient(ellipse 60% 55% at 50% 50%, #000 20%, transparent 75%)",
      }}
    />
  );
}
