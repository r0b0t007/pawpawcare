import { CinematicHero } from "@/components/ui/cinematic-landing-hero";

export default function App() {
  return (
    <div className="overflow-x-hidden w-[100%] min-h-screen">
      <CinematicHero
        brandName="PawPaw"
        tagline1="Every shot, every gram,"
        tagline2="remembered for you."
        cardHeading="Calm pet care, redefined."
        cardDescription={
          <>
            <span className="text-white font-semibold">PawPawCare</span> keeps
            vaccine reminders, medication schedules, weight trends, and vet
            records for the whole furry family in one calm place.
          </>
        }
        metricValue={365}
        metricLabel="Days protected"
        ctaHeading="Join the free preview."
        ctaDescription="Waitlist members are onboarded in small batches — your invite arrives with the next one."
      />
    </div>
  );
}
