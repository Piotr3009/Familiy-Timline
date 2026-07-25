/**
 * Decorative background for the app: warm landscape anchored to the
 * bottom edge plus scattered watercolor sprigs and a songbird.
 * Purely visual — aria-hidden and pointer-events: none (see globals.css).
 * Sprig density is deliberately low so family photos stay the heroes.
 */
export function BackgroundDecor() {
  return (
    <div className="decor-layer" aria-hidden="true">
      <img
        src="/decor/leaves-1.png"
        alt=""
        className="decor-sprig"
        style={{top: '4rem', left: '-3rem', width: 220, transform: 'rotate(-12deg)'}}
      />
      <img
        src="/decor/branch-bird.png"
        alt=""
        className="decor-sprig hidden md:block"
        style={{top: '6rem', right: '-2.5rem', width: 260, transform: 'scaleX(-1) rotate(-6deg)'}}
      />
      <img
        src="/decor/leaves-2.png"
        alt=""
        className="decor-sprig hidden sm:block"
        style={{bottom: '22vh', left: '-4rem', width: 240, transform: 'rotate(24deg)'}}
      />
      <img
        src="/decor/leaves-3.png"
        alt=""
        className="decor-sprig hidden lg:block"
        style={{bottom: '24vh', right: '-3rem', width: 230, transform: 'rotate(-18deg)'}}
      />
      <img src="/decor/landscape.png" alt="" className="decor-landscape" />
    </div>
  );
}
