import React from "react";
import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

export const Toaster: React.FC<ToasterProps> = ({ ...props }) => {
  return (
    <SonnerToaster
      theme="dark"
      className="toaster group"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-slate-900/95 group-[.toaster]:text-slate-100 group-[.toaster]:border-slate-800 group-[.toaster]:shadow-2xl group-[.toaster]:rounded-xl group-[.toaster]:backdrop-blur-md",
          description: "group-[.toast]:text-slate-400 text-xs",
          actionButton:
            "group-[.toast]:bg-sky-500 group-[.toast]:text-white font-medium text-xs rounded-lg px-2.5 py-1.5",
          cancelButton:
            "group-[.toast]:bg-slate-800 group-[.toast]:text-slate-300 font-medium text-xs rounded-lg px-2.5 py-1.5",
          error:
            "group-[.toaster]:border-rose-500/40 group-[.toaster]:text-rose-200",
          success:
            "group-[.toaster]:border-emerald-500/40 group-[.toaster]:text-emerald-200",
          warning:
            "group-[.toaster]:border-amber-500/40 group-[.toaster]:text-amber-200",
          info:
            "group-[.toaster]:border-sky-500/40 group-[.toaster]:text-sky-200",
        },
      }}
      {...props}
    />
  );
};

export { toast } from "sonner";
