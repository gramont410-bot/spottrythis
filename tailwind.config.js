/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        spot: {
          bg: '#0F172A',
          sidebar: '#111827',
          card: '#1E293B',
          primary: '#2563EB',
          success: '#22C55E',
          warning: '#F59E0B',
          danger: '#EF4444',
          gray: '#64748B'
        }
      },
      borderRadius: {
        'btn': '10px',
        'card': '16px'
      }
    }
  },
  plugins: []
};

