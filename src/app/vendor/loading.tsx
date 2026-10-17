import { Loader2, Wrench } from "lucide-react";

export default function VendorLoading() {
  return (
    <div className="min-h-screen bg-[#F8F6EE] flex flex-col items-center justify-center p-6 text-[#2E3A2F]">
      <div className="size-14 rounded-2xl bg-[#2E3A2F] text-[#F8F6EE] flex items-center justify-center shadow-md mb-4 animate-pulse">
        <Wrench className="size-7 text-[#C96F4F]" />
      </div>
      <div className="flex items-center gap-2 text-sm font-semibold text-[#2E3A2F]">
        <Loader2 className="size-4 animate-spin text-[#C96F4F]" />
        <span>Loading Vendor Dashboard...</span>
      </div>
      <p className="text-xs text-[#2E3A2F]/60 mt-1">
        Retrieving assigned service pools & flat manifests
      </p>
    </div>
  );
}
