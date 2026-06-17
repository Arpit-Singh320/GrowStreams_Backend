'use client';

import Link from 'next/link';
import { useNetworkMode } from '@/contexts/NetworkModeContext';

/**
 * NetworkToggle component rendering the dynamic network link selector.
 */
export default function NetworkToggle() {
  const { isVaraEth } = useNetworkMode();

  return (
    <div className="flex items-center justify-between gap-1.5 select-none w-full">
      {/* left side */}
      <Link
        href="/app/vara-eth"
        className={`relative flex-1 flex h-7 items-center justify-center rounded-md bg-gradient-to-r from-[#DFCEF7] to-[#C1C3F3] px-2 transition-all duration-300 ${
          isVaraEth ? 'opacity-100 ring-1 ring-purple-400/30' : 'opacity-40 hover:opacity-90'
        }`}
      >
        <svg viewBox="0 0 126 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-2.5 max-md:hidden w-auto max-w-full">
          <g clipPath="url(#clip0_5971_2421)">
            <path d="M73.5752 12.9235H70.4434V16.0004H73.5752V12.9235Z" fill="url(#paint0_linear_5971_2421)"></path>
            <path d="M92.8027 3.09102H98.6518V16.0008H101.793V3.09102H107.642V0.00158691H92.8027V3.09102Z" fill="url(#paint1_linear_5971_2421)"></path>
            <path d="M122.467 0.00158691V5.53884H113.271V0.00158691H110.139V16.0008H113.271V8.62578H122.467V16.0008H125.599V0.00158691H122.467Z" fill="url(#paint2_linear_5971_2421)"></path>
            <path d="M13.3125 0.00183105V13.3224L3.8242 0.00183105H0L11.3983 16.001H16.4452V0.00183105H13.3125Z" fill="url(#paint3_linear_5971_2421)"></path>
            <path d="M23.7871 0.00158691H18.7402V15.9999H23.7846L27.5725 10.6818L31.3612 15.9999H35.1854L23.7871 0.00158691ZM21.872 13.3164V2.68015L25.6608 7.9991L21.872 13.3164Z" fill="url(#paint4_linear_5971_2421)"></path>
            <path d="M57.1562 0.00158691H52.1094V15.9999H57.1537L60.9416 10.6818L64.7303 15.9999H68.5545L57.1562 0.00158691ZM55.2412 13.3164V2.68015L59.0299 7.9991L55.2412 13.3164Z" fill="url(#paint5_linear_5971_2421)"></path>
            <path d="M50.6917 6.57066L46.0113 0H36.127V15.9983H39.2588L44.0506 12.0457L46.8675 15.9992H50.6908L46.4596 10.0593L50.6917 6.57066ZM39.2596 11.9793V3.07948H44.3808L46.4791 6.02449L39.2596 11.9793Z" fill="url(#paint6_linear_5971_2421)"></path>
            <path d="M90.302 3.09102V0.00158691H75.4629V11.9061V11.9402L78.3557 16.0008H90.302V12.9238H79.9854L78.593 10.969V8.62578H90.302V5.53884H78.593V3.09102H90.302Z" fill="url(#paint7_linear_5971_2421)"></path>
          </g>
          <defs>
            <linearGradient id="paint0_linear_5971_2421" x1="-0.233932" y1="14.4624" x2="123.832" y2="14.4624" gradientUnits="userSpaceOnUse">
              <stop stopColor="#02FBC1"></stop>
              <stop offset="1" stopColor="#293241"></stop>
            </linearGradient>
            <linearGradient id="paint1_linear_5971_2421" x1="0.00189413" y1="8.00159" x2="123.832" y2="8.00159" gradientUnits="userSpaceOnUse">
              <stop stopColor="#02FBC1"></stop>
              <stop offset="1" stopColor="#293241"></stop>
            </linearGradient>
            <linearGradient id="paint2_linear_5971_2421" x1="-0.000687714" y1="8.00159" x2="123.829" y2="8.00159" gradientUnits="userSpaceOnUse">
              <stop stopColor="#02FBC1"></stop>
              <stop offset="1" stopColor="#293241"></stop>
            </linearGradient>
            <linearGradient id="paint3_linear_5971_2421" x1="0" y1="8.00183" x2="0.0844381" y2="8.00183" gradientUnits="userSpaceOnUse">
              <stop stopColor="#02FBC1"></stop>
              <stop offset="1" stopColor="#293241"></stop>
            </linearGradient>
            <linearGradient id="paint4_linear_5971_2421" x1="0.00172722" y1="8.00076" x2="0.0861653" y2="8.00076" gradientUnits="userSpaceOnUse">
              <stop stopColor="#02FBC1"></stop>
              <stop offset="1" stopColor="#293241"></stop>
            </linearGradient>
            <linearGradient id="paint5_linear_5971_2421" x1="-0.000772878" y1="8.00076" x2="0.0836653" y2="8.00076" gradientUnits="userSpaceOnUse">
              <stop stopColor="#02FBC1"></stop>
              <stop offset="1" stopColor="#293241"></stop>
            </linearGradient>
            <linearGradient id="paint6_linear_5971_2421" x1="0.000948632" y1="8" x2="0.0853868" y2="8" gradientUnits="userSpaceOnUse">
              <stop stopColor="#02FBC1"></stop>
              <stop offset="1" stopColor="#293241"></stop>
            </linearGradient>
            <linearGradient id="paint7_linear_5971_2421" x1="0.00222488" y1="8.00159" x2="0.086663" y2="8.00159" gradientUnits="userSpaceOnUse">
              <stop stopColor="#02FBC1"></stop>
              <stop offset="1" stopColor="#293241"></stop>
            </linearGradient>
            <clipPath id="clip0_5971_2421">
              <rect width="125.6" height="16" fill="white"></rect>
            </clipPath>
          </defs>
        </svg>
        <svg viewBox="0 0 33 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-2 md:hidden w-auto max-w-full">
          <path d="M33 0V3.08855H16.164V16H11.2043L0 0H3.75941L13.0856 13.3207V0H33Z" fill="currentColor"></path>
          <path d="M18.418 11.9383L21.2605 16H33.0005V12.9221H22.8609L21.493 10.9669V8.6246H33.0005V5.53687H18.418V11.9383Z" fill="currentColor"></path>
        </svg>
      </Link>

      {/* centre toggle */}
      <Link
        href={isVaraEth ? '/app' : '/app/vara-eth'}
        className="flex-shrink-0 flex items-center justify-center p-0.5 transition-opacity duration-300 hover:opacity-85"
      >
        <svg viewBox="0 0 32 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-8">
          <g clipPath="url(#clip0_5971_2431)">
            <rect width="32" height="16" rx="4" fill="#2C2137"></rect>
            <path
              d="M4 0.5H12C13.933 0.5 15.5 2.067 15.5 4V12C15.5 13.933 13.933 15.5 12 15.5H4C2.067 15.5 0.5 13.933 0.5 12V4C0.5 2.067 2.067 0.5 4 0.5Z"
              fill="white"
              stroke="#2C2137"
              className="transition-transform duration-300 ease-in-out transform-gpu"
              style={{ transform: !isVaraEth ? 'translateX(16px)' : 'translateX(0px)' }}
            />
          </g>
          <rect x="0.5" y="0.5" width="31" height="15" rx="3.5" stroke="#2C2137"></rect>
          <defs>
            <clipPath id="clip0_5971_2431">
              <rect width="32" height="16" rx="4" fill="white"></rect>
            </clipPath>
          </defs>
        </svg>
      </Link>

      {/* right side button */}
      <Link
        href="/app"
        className={`relative flex-1 flex h-7 items-center justify-center rounded-md px-2 text-black transition-all duration-300 ${
          !isVaraEth
            ? 'bg-[#02FBC1] opacity-100 hover:opacity-85'
            : 'bg-[#02FBC1]/10 text-[#02FBC1] border border-[#02FBC1]/20 opacity-40 hover:opacity-90'
        }`}
      >
        <svg viewBox="0 0 116 25" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3.5 max-md:hidden w-auto max-w-full">
          <g clipPath="url(#clip0_5971_2469)">
            <path d="M7.82815 8.85405L5.48709 0H3.83362L7.82815 15.1076V20.8733L2.30971 0H0.65625L7.00142 24H7.82815H8.6544H9.48112V0H7.82815V8.85405Z" fill="currentColor"></path>
            <path d="M37.257 24L30.9118 0H30.0851H29.2584H28.4316V23.9995H30.0851L34.4492 19.6337L35.6036 23.9995H37.257V24ZM32.9822 14.0834L30.0856 16.9798V3.12677L32.9822 14.0834ZM30.0851 21.6601V19.3177L33.4707 15.9323L33.9606 17.7848L30.0851 21.6601Z" fill="currentColor"></path>
            <path d="M12.966 0H12.1392H11.3125V23.9995H12.966L17.3301 19.6337L18.4845 23.9995H20.1379L13.7922 0H12.966ZM15.8626 14.0833L12.966 16.9798V3.12677L15.8626 14.0833ZM12.966 21.6601V19.3177L16.3515 15.9322L16.8416 17.7847L12.966 21.6601Z" fill="currentColor"></path>
            <path d="M27.0003 14.8288L23.0798 0H22.2531H21.4263H20.5996V23.9995H22.2531V19.549L23.772 18.0302L25.3503 23.9995L27.0003 23.9874L25.0796 16.7227L25.687 16.1152L27.0003 14.8288ZM22.2531 17.2111V3.12677L25.1981 14.2663L22.2531 17.2111Z" fill="currentColor"></path>
          </g>
          <path d="M40.8725 24.3619H39.2405V21.6759H40.8725V24.3619ZM49.674 0.0178695H51.34V23.8179H49.674L44.472 20.0439V23.8179H42.84V0.0178695H44.472L49.674 3.82587V0.0178695H42.84V0.0178695H44.472L49.674 3.82587V0.0178695ZM49.674 22.0159V5.66187L44.472 1.85387V18.2079L49.674 22.0159ZM62.6007 1.51387H55.4947V6.64787H62.6007V8.17787L58.7247 9.63987V22.3559H62.6007V23.8179H53.8627V9.91187L58.6567 8.10987H53.8627V0.0178695H62.6007V1.51387ZM57.0927 22.3559V10.2519L55.4947 10.8639V22.3559H57.0927ZM71.5012 1.51387H62.7632V0.0178695H71.5012V1.51387ZM62.7632 4.70987V3.21387H71.5012V4.70987H67.9312V23.8179H66.2992V4.70987H62.7632ZM80.3396 0.0178695H81.9716V23.8179H80.3396V21.6419L77.3136 19.4659L74.3216 21.6419V23.8179H72.6896V0.0178695H74.3216V16.2359L77.3136 14.0599L80.3396 16.2359V0.0178695ZM80.3396 19.8399V18.0379L77.3136 15.8619L74.3216 18.0379V19.8399L77.3136 17.6299L80.3396 19.8399ZM84.51 0.0178695H93.248V23.8179H84.51V0.0178695ZM91.616 22.3559V1.51387H86.142V22.3559H91.616ZM89.61 20.5879H88.114V3.17987H89.61V20.5879ZM104.299 10.6259H104.231L101.137 12.8699L104.299 16.4399V23.8519H102.633V16.8139L99.947 13.7199L97.431 15.5559V23.8179H95.799V0.0178695H104.299V10.6259ZM102.633 9.94587V8.17787L97.431 11.9859V13.7539L102.633 9.94587ZM102.633 6.34187V1.51387H97.431V10.1499L102.633 6.34187ZM115.19 0.0178695V12.1899L111.756 14.6719L115.19 18.5479V23.8179H113.524V18.9219L110.566 15.5219L108.322 17.1879V23.8179H106.69V0.0178695H108.322V11.7479L113.524 7.93987V0.0178695H115.19ZM113.524 11.5439V9.77587L108.322 13.5839V15.3519L113.524 11.5439Z" fill="currentColor"></path>
          <defs>
            <clipPath id="clip0_5971_2469">
              <rect width="36.6" height="24" fill="white" transform="translate(0.65625)"></rect>
            </clipPath>
          </defs>
        </svg>
        <svg viewBox="0 0 22 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 md:hidden w-auto max-w-full">
          <path d="M17.9134 8.84841L12.0692 0H7.93875L17.8988 15.1067V20.8709L4.13049 0H0L15.8189 24H22V0H17.8842V8.84841H17.9134Z" fill="currentColor"></path>
        </svg>
      </Link>
    </div>
  );
}
