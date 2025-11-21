import { useState } from "react";
import { useForm } from "react-hook-form";
import { motion } from "framer-motion";

import { useCreateResidentRequest } from "../api/hooks";
import type { IssueCategory } from "../types";
import { MapPicker } from "./MapPicker";

interface Props {
  categories: IssueCategory[];
  mapsApiKey?: string | null;
}

interface FormValues {
  service_code: string;
  description: string;
  address_string?: string;
  resident_name?: string;
  resident_email?: string;
  resident_phone?: string;
}

export function RequestForm({ categories, mapsApiKey }: Props) {
  const { register, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: { service_code: categories[0]?.slug ?? "" },
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const createRequest = useCreateResidentRequest();

  const onSubmit = handleSubmit((values) => {
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      if (value) formData.append(key, value);
    });
    if (coords) {
      formData.append("latitude", coords.lat.toString());
      formData.append("longitude", coords.lng.toString());
    }
    createRequest.mutate(formData, {
      onSuccess: () => {
        reset();
        setCoords(null);
      },
    });
  });

  return (
    <motion.form
      layout
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl bg-white/80 p-6 shadow-xl"
    >
      <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
        No login required—leave your email or phone only if you want status updates for this
        request.
      </p>

      <div>
        <label className="text-sm font-medium text-slate-600">Category</label>
        <select
          {...register("service_code", { required: true })}
          className="mt-1 w-full rounded-xl border border-slate-300 p-2"
        >
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600">Description</label>
        <textarea
          {...register("description", { required: true })}
          rows={4}
          className="mt-1 w-full rounded-xl border border-slate-300 p-2"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-slate-600">Name</label>
          <input
            {...register("resident_name")}
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Email</label>
          <input
            {...register("resident_email")}
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-slate-600">Phone</label>
          <input
            {...register("resident_phone")}
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Address</label>
          <input
            {...register("address_string")}
            className="mt-1 w-full rounded-xl border border-slate-300 p-2"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600">Location</label>
        <MapPicker apiKey={mapsApiKey} lat={coords?.lat} lng={coords?.lng} onChange={setCoords} />
        {coords && (
          <p className="mt-1 text-xs text-slate-500">
            {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
          </p>
        )}
      </div>

      <button
        type="submit"
        className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white shadow-lg"
        disabled={createRequest.isPending}
      >
        {createRequest.isPending ? "Submitting..." : "Submit Request"}
      </button>
    </motion.form>
  );
}
