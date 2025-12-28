'use client';

import React from 'react';

const Footer: React.FC = () => {
    return (
        <footer className="relative z-10 py-12 border-t border-[#f4cf8b]/10 bg-transparent text-center">
            <p className="text-neutral-500 text-sm">
                © {new Date().getFullYear()} CtxOpt Inc. Built for the future of AI.
            </p>
        </footer>
    );
};

export default Footer;
