// src/components/Modal.tsx
"use client";

import React, { useEffect, useRef } from "react";

type ModalProps = {
    open: boolean;
    title?: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
};

export default function Modal({ open, title, onClose, children, footer }: ModalProps) {
    const panelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        if (open) {
            window.addEventListener("keydown", onKey);
            // 初回フォーカス
            setTimeout(() => panelRef.current?.focus(), 0);
            document.documentElement.style.overflow = "hidden";
        }
        return () => {
            window.removeEventListener("keydown", onKey);
            document.documentElement.style.overflow = "";
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div
                ref={panelRef}
                tabIndex={-1}
                className="relative w-full max-w-xl rounded-2xl bg-white shadow-lg p-5 outline-none"
            >
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold">{title}</h3>
                    <button
                        className="h-8 w-8 rounded-full hover:bg-gray-100"
                        onClick={onClose}
                        aria-label="閉じる"
                    >
                        ×
                    </button>
                </div>

                <div>{children}</div>

                {footer && <div className="mt-4">{footer}</div>}
            </div>
        </div>
    );
}
