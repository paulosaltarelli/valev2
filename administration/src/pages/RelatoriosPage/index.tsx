import { Icon } from "@iconify/react";
import { Button } from "../../components/utils/Button";
import { useNavigate } from "react-router";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import { FinanceiroTimelineReport } from "../../components/Relatorios/FinanceiroTimelineReport";
import { useState } from "react";

export function RelatoriosPage() {
  const navigate = useNavigate();
  const [active, setActive] = useState<string>("financeiro");
  return (
    <>
      <div className="card mb-3">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between gap-2">
            <div className="d-flex align-items-center gap-2">
              <Button
                variant="outline-secondary"
                className="m-0 px-1 py-1 border-0"
                onClick={() => navigate(`/`)}
              >
                <Icon
                  icon="solar:alt-arrow-left-linear"
                  width={20}
                  height={20}
                />
              </Button>
              <div>
                <h1 className="h4 m-0 p-0">Relatórios</h1>
                <div className="text-secondary small">
                  Análises históricas e comparativos (por período de datas).
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <Tabs
            id="relatorios-tabs"
            activeKey={active}
            onSelect={(k) => k && setActive(k)}
            className={`mb-3 bg-base`}
          >
            <Tab eventKey="financeiro" title="Financeiro">
              <FinanceiroTimelineReport />
            </Tab>
            {/* <Tab eventKey="em_breve" title="Em breve" disabled>
              <div className="text-secondary">Mais relatórios virão aqui.</div>
            </Tab> */}
          </Tabs>
        </div>
      </div>
    </>
  );
}
