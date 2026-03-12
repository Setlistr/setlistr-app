import Image from 'next/image'

export default function BetaPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-cream px-6"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #1e1c18 0%, #0f0e0c 100%)' }}>
      <Image src="/logo-pill.png" alt="Setlistr" width={200} height={52} className="mb-8" />
      <p className="text-[#6a6660] text-center text-sm max-w-xs mb-8">
        We're currently in private beta. Access is by invite only.
      </p>
      <div className="bg-[#1a1814] border border-[#2e2b26] rounded-2xl px-6 py-4 text-center max-w-xs">
        <p className="text-xs text-[#4a4640] uppercase tracking-wider mb-2">Want early access?</p>
        <a href="mailto:jesse.slack.music@gmail.com"
          className="text-gold text-sm hover:text-yellow-300 transition-colors">
          Request an invite
        </a>
      </div>
    </div>
  )
}
