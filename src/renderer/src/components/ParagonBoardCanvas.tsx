/**
 * Re-export ParagonBoardCanvas from the shared location.
 *
 * The component lives in src/shared/components/ so both the
 * overlay and config windows can import it. This re-export
 * keeps existing import paths working.
 */
export { default } from '../../../shared/components/ParagonBoardCanvas'
