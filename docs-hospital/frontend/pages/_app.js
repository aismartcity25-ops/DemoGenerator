import '../styles/globals.css';
import { HospitalProvider } from '../context/HospitalContext';

function MyApp({ Component, pageProps }) {
  return (
    <HospitalProvider>
      <Component {...pageProps} />
    </HospitalProvider>
  );
}

export default MyApp;