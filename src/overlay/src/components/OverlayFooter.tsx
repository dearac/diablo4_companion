/**
 * OverlayFooter — Bottom bar with Config and Close buttons.
 * Config re-shows the build import window.
 * Close destroys the overlay window entirely.
 */

function OverlayFooter(): React.JSX.Element {
  const handleClose = (): void => {
    window.api.closeOverlay()
  }

  const handleOpenConfig = (): void => {
    window.api.openConfig()
  }

  return (
    <div className="overlay-footer">
      <button className="overlay-footer__button" onClick={handleOpenConfig}>
        ⚙ Config
      </button>
      <button className="overlay-footer__button" onClick={handleClose}>
        ✕ Close
      </button>
    </div>
  )
}

export default OverlayFooter
