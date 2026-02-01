"use client";

import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../contexts/AuthContext";
import { X } from "lucide-react";
import "../styles/SignInDialog.css";

interface SignInDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SignInDialog({ isOpen, onClose }: SignInDialogProps) {
    const { login } = useAuth();

    if (!isOpen) return null;

    const handleLoginSuccess = async (credential: string) => {
        await login(credential);
        onClose();
    };

    return (
        <div className="signin-dialog-overlay" onClick={onClose}>
            <div className="signin-dialog-content" onClick={(e) => e.stopPropagation()}>
                <button className="signin-dialog-close" onClick={onClose}>
                    <X size={20} />
                </button>

                <div className="signin-dialog-icon">🎰</div>
                <h3 className="signin-dialog-title">Sign In to Play</h3>
                <p className="signin-dialog-subtitle">
                    Please sign in to place bets and start playing
                </p>

                <div className="signin-dialog-google">
                    <GoogleLogin
                        onSuccess={(credentialResponse) => {
                            if (credentialResponse.credential) {
                                handleLoginSuccess(credentialResponse.credential);
                            }
                        }}
                        onError={() => {
                            console.log('Login Failed');
                        }}
                        theme="filled_black"
                        shape="pill"
                        size="large"
                    />
                </div>

                <p className="signin-dialog-bonus">
                    🎁 New users get <strong>₹100 FREE</strong> bonus!
                </p>
            </div>
        </div>
    );
}
