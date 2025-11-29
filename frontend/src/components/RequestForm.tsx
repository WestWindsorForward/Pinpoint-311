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
  const { register, handleSubmit, reset, setValue } = useForm<FormValues>({
    defaultValues: { service_code: categories[0]?.slug ?? "" },
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string>("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const createRequest = useCreateResidentRequest();
  const hasCategories = categories.length > 0;

  const handleLocationChange = (newCoords: { lat: number; lng: number }, address?: string) => {
    setCoords(newCoords);
    if (address) {
      setSelectedAddress(address);
      setValue("address_string", address);
    } else {
      setSelectedAddress("");
      setValue("address_string", "");
    }
  };

  const onSubmit = handleSubmit((values) => {
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      if (value) formData.append(key, value);
    });
    if (coords) {
      formData.append("latitude", coords.lat.toString());
      formData.append("longitude", coords.lng.toString());
    }
    attachments.forEach((file) => formData.append("media", file));
    createRequest.mutate(formData, {
      onSuccess: () => {
        reset();
        setCoords(null);
        setSelectedAddress("");
        setAttachments([]);
      },
    });
  });

  const handleFilesChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    const limited = files.slice(0, 5);
    setAttachments(limited);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== index));
  };

  if (!hasCategories) {
    return (
      <motion.div layout className="space-y-4 rounded-2xl bg-white/80 p-6 text-sm text-slate-600 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Publish categories to open the resident portal</h3>
        <p>
          Residents can’t submit requests until at least one service category is active. Head to{" "}
          <strong>Admin → Categories</strong> to create categories and assign them to a department. Refresh this page once
          you’re done.
        </p>
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
          Tip: Publish a “Road maintenance” category so county/state roads can be routed correctly using the new
          jurisdiction filters.
        </p>
      </motion.div>
    );
  }

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

      <div>
        <label className="text-sm font-medium text-slate-600">Phone</label>
        <input
          {...register("resident_phone")}
          className="mt-1 w-full rounded-xl border border-slate-300 p-2"
        />
      </div>

        <div>
          <label className="text-sm font-medium text-slate-600">Location</label>
          <MapPicker apiKey={mapsApiKey} lat={coords?.lat} lng={coords?.lng} onChange={handleLocationChange} />
          <p className="mt-1 text-xs text-slate-500">
            Drop the pin inside township limits. We’ll block requests outside the allowed boundary or inside excluded
            county/state zones.
          </p>
          {selectedAddress && (
            <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
              📍 <span className="font-medium">{selectedAddress}</span>
            </p>
          )}
          {coords && !selectedAddress && (
            <p className="mt-2 text-xs text-slate-500">
              Coordinates: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
            </p>
          )}
        </div>

      <div>
          <label className="text-sm font-medium text-slate-600">Photos & evidence</label>
          <input
            type="file"
            accept="image/*"
            multiple
            className="mt-1 w-full rounded-xl border border-dashed border-slate-300 p-2"
            onChange={handleFilesChanged}
          />
          <p className="mt-1 text-xs text-slate-500">Attach up to five photos or screenshots to help staff verify.</p>
          {attachments.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {attachments.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-1">
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    className="text-[11px] font-semibold uppercase text-rose-500"
                    onClick={() => removeAttachment(index)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
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
