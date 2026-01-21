import Image from "next/image";

export function Loading() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4">
        <Image
          src="/logo.png"
          alt="Mis Horas Med"
          width={120}
          height={120}
          className="animate-pulse"
          priority
        />
        <div className="text-lg sm:text-xl font-semibold text-gray-900">
          Mis Horas Med
        </div>
      </div>
    </main>
  );
}
