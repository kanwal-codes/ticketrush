import { HeroSkeleton } from '../components/PageSkeletons'

/** The first thing on screen while the app's code loads: the shape of the home page, not a blank page. */
export function BootFallback() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading TicketRush">
      <HeroSkeleton />
    </div>
  )
}
