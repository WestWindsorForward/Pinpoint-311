import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import client from "../../api/client";
import { useResidentConfig } from "../../api/hooks";

type BrandingForm = {
  town_name: string;
  site_title: string;
  hero_text: string;
  primary_color: string;
  secondary_color: string;
};

export function BrandingPage() {
  const queryClient = useQueryClient();
  const { data, refetch } = useResidentConfig();
  const defaults = data?.branding ?? {};
  const { register, handleSubmit, reset } = useForm<BrandingForm>({
    defaultValues: {
      town_name: defaults.town_name ?? "",
      site_title: defaults.site_title ?? "",
      hero_text: defaults.hero_text ?? "",
      primary_color: defaults.primary_color ?? "#0f172a",
      secondary_color: defaults.secondary_color ?? "#38bdf8",
    },
  });

  const mutation = useMutation({
    mutationFn: async (payload: BrandingForm) => client.put("/api/admin/branding", payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["resident-config"] });
      await refetch();
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    await mutation.mutateAsync(values);
    reset(values);
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Branding</h1>
        <p className="text-sm text-slate-500">Colors and hero copy shown on the resident portal.</p>
      </div>
      <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-600">
          Town name
          <input className="mt-1 w-full rounded-xl border border-slate-300 p-2" {...register("town_name")} />
        </label>
        <label className="text-sm text-slate-600">
          Site title
          <input className="mt-1 w-full rounded-xl border border-slate-300 p-2" {...register("site_title")} />
        </label>
        <label className="text-sm text-slate-600 md:col-span-2">
          Hero text
          <input className="mt-1 w-full rounded-xl border border-slate-300 p-2" {...register("hero_text")} />
        </label>
        <label className="text-sm text-slate-600">
          Primary color
          <input className="mt-1 w-full rounded-xl border border-slate-300 p-2" {...register("primary_color")} />
        </label>
        <label className="text-sm text-slate-600">
          Secondary color
          <input className="mt-1 w-full rounded-xl border border-slate-300 p-2" {...register("secondary_color")} />
        </label>
        <div className="md:col-span-2 flex items-center justify-end gap-3">
          <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

