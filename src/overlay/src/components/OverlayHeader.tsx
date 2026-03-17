/**
 * OverlayHeader — Displays the build name and class at the top
 * of the overlay panel. Uses the Cinzel display font for the
 * gothic Diablo aesthetic.
 */

interface OverlayHeaderProps {
  buildName: string
  d4Class: string
}

function OverlayHeader({ buildName, d4Class }: OverlayHeaderProps): React.JSX.Element {
  return (
    <div className="overlay-header">
      <h1 className="overlay-header__title">{buildName}</h1>
      <span className="overlay-header__class">{d4Class}</span>
    </div>
  )
}

export default OverlayHeader
