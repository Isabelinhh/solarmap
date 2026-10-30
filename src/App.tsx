import { useEffect, useState } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import './App.css';

type Tipo = 'Residencial' | 'Comercial' | 'Industrial' | 'Rural';

interface Instalacao {
  id: string;
  nome: string;
  tipo: Tipo;
  paineis: number;
  potenciaKwp: number;
  latitude: number;
  longitude: number;
  precisao: number;
  cadastradoEm: string;
}

interface Gps {
  latitude: number;
  longitude: number;
  precisao: number;
}

const CHAVE = 'solarmap:instalacoes';
const PRECISAO_MAX_M = 100; // acima disso o ponto no mapa fica pouco confiável

function carregar(): Instalacao[] {
  try {
    const bruto = localStorage.getItem(CHAVE);
    return bruto ? (JSON.parse(bruto) as Instalacao[]) : [];
  } catch {
    return [];
  }
}

function traduzirErro(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (msg.includes('denied') || msg.includes('permission')) {
    return 'Permissão de localização negada. Ative-a nas configurações do app e tente de novo.';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'Tempo esgotado ao buscar o GPS. Vá para um local aberto e tente novamente.';
  }
  if (msg.includes('disabled') || msg.includes('location services')) {
    return 'O GPS do aparelho está desligado. Ative a localização e tente novamente.';
  }
  return 'Não foi possível obter a localização. Tente novamente.';
}

function linkMapa(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export default function App() {
  const [lista, setLista] = useState<Instalacao[]>(carregar);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<Tipo>('Residencial');
  const [paineis, setPaineis] = useState('');
  const [potencia, setPotencia] = useState('');
  const [gps, setGps] = useState<Gps | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(lista));
    } catch {
      /* armazenamento indisponível: a lista vale só nesta sessão */
    }
  }, [lista]);

  async function capturarGps() {
    setBuscando(true);
    setErro(null);
    setAviso(null);
    try {
      let perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted') {
        perm = await Geolocation.requestPermissions();
      }
      if (perm.location !== 'granted') throw new Error('permission denied');

      const r = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
      setGps({
        latitude: r.coords.latitude,
        longitude: r.coords.longitude,
        precisao: r.coords.accuracy,
      });
    } catch (e) {
      setGps(null);
      setErro(traduzirErro(e));
    } finally {
      setBuscando(false);
    }
  }

  function cadastrar() {
    setErro(null);
    setAviso(null);

    const qtd = Number(paineis);
    const kwp = Number(potencia.replace(',', '.'));

    if (nome.trim().length < 3) return setErro('Informe um nome com pelo menos 3 letras.');
    if (!Number.isInteger(qtd) || qtd < 1) return setErro('A quantidade de painéis deve ser um número inteiro maior que zero.');
    if (!(kwp > 0)) return setErro('A potência instalada deve ser maior que zero.');
    if (!gps) return setErro('Capture a localização no local da instalação antes de cadastrar.');
    if (gps.precisao > PRECISAO_MAX_M) {
      return setErro(`Precisão do GPS baixa (± ${gps.precisao.toFixed(0)} m). Vá para um local aberto e capture de novo (máximo ${PRECISAO_MAX_M} m).`);
    }

    const nova: Instalacao = {
      id: crypto.randomUUID(),
      nome: nome.trim(),
      tipo,
      paineis: qtd,
      potenciaKwp: kwp,
      latitude: gps.latitude,
      longitude: gps.longitude,
      precisao: gps.precisao,
      cadastradoEm: new Date().toLocaleString('pt-BR'),
    };
    setLista([nova, ...lista]);
    setNome('');
    setPaineis('');
    setPotencia('');
    setGps(null);
    setAviso('Instalação cadastrada.');
  }

  function remover(id: string) {
    setLista(lista.filter((i) => i.id !== id));
  }

  const totalKwp = lista.reduce((s, i) => s + i.potenciaKwp, 0);

  return (
    <main className="app">
      <h1>SolarMap</h1>
      <p className="sub">Cadastre instalações de painéis solares com a localização exata e acompanhe a energia verde mapeada.</p>

      <section className="panel">
        <div className="total">
          <span className="sub">{lista.length} {lista.length === 1 ? 'instalação' : 'instalações'}</span>
          <strong>{totalKwp.toFixed(2)} kWp</strong>
        </div>
      </section>

      <section className="panel">
        <h2>Nova instalação</h2>

        <label className="field">Nome ou identificação
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Telhado da padaria" />
        </label>

        <label className="field">Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
            <option>Residencial</option>
            <option>Comercial</option>
            <option>Industrial</option>
            <option>Rural</option>
          </select>
        </label>

        <div className="two">
          <label className="field">Painéis
            <input type="number" inputMode="numeric" min="1" value={paineis} onChange={(e) => setPaineis(e.target.value)} />
          </label>
          <label className="field">Potência (kWp)
            <input inputMode="decimal" value={potencia} onChange={(e) => setPotencia(e.target.value)} placeholder="5,4" />
          </label>
        </div>

        <div className={`gps ${gps ? 'ok' : ''}`} aria-live="polite">
          {gps ? (
            <>
              Lat <b>{gps.latitude.toFixed(6)}</b><br />
              Lng <b>{gps.longitude.toFixed(6)}</b><br />
              Precisão <b>± {gps.precisao.toFixed(1)} m</b>
            </>
          ) : (
            'Nenhuma coordenada capturada. Fique no local da instalação.'
          )}
        </div>

        <button className="btn secondary" onClick={capturarGps} disabled={buscando}>
          {buscando ? 'Buscando GPS…' : gps ? 'Capturar novamente' : 'Capturar localização'}
        </button>

        {erro && <div className="error" role="alert">{erro}</div>}
        {aviso && <div className="success" role="status">{aviso}</div>}

        <button className="btn primary" onClick={cadastrar}>Cadastrar instalação</button>
      </section>

      <section className="panel">
        <h2>Instalações cadastradas</h2>
        {lista.length === 0 && <p className="empty">Nenhuma instalação ainda. Cadastre a primeira acima.</p>}
        {lista.map((i) => (
          <article className="item" key={i.id}>
            <header>
              <strong>{i.nome}</strong>
              <span>{i.potenciaKwp.toFixed(2)} kWp</span>
            </header>
            <small>
              {i.tipo}, {i.paineis} {i.paineis === 1 ? 'painel' : 'painéis'}<br />
              {i.latitude.toFixed(6)}, {i.longitude.toFixed(6)} (± {i.precisao.toFixed(0)} m)<br />
              {i.cadastradoEm}
            </small>
            <div className="actions">
              <button className="btn secondary small" onClick={() => window.open(linkMapa(i.latitude, i.longitude), '_blank')}>
                Abrir no Google Maps
              </button>
              <button className="btn danger small" onClick={() => remover(i.id)}>Remover</button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
