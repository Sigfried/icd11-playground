import { useEffect, useState } from "react";
import { getFoundationEntity, getMmsEntity, getEntityByUri } from "../api/client";
import { JsonViewer } from "./JsonViewer";
import type { MMSEntity, FoundationEntity, LocalizedText } from "../types/icd";

interface EntityDetailProps {
  foundationUri?: string;
  linearizationUri?: string;
  foundationId?: string;
  mmsId?: string;
}

function getText(text: LocalizedText | undefined): string {
  return text?.["@value"] ?? "";
}

function extractIdFromUri(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 1];
}

export function EntityDetail({
  foundationUri,
  linearizationUri,
  foundationId,
  mmsId,
}: EntityDetailProps) {
  const [foundationData, setFoundationData] = useState<FoundationEntity | null>(null);
  const [mmsData, setMmsData] = useState<MMSEntity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const effectiveFoundationId = foundationId || (foundationUri ? extractIdFromUri(foundationUri) : null);
    const effectiveMmsId = mmsId || (linearizationUri ? extractIdFromUri(linearizationUri) : null);

    if (!effectiveFoundationId && !effectiveMmsId) {
      setFoundationData(null);
      setMmsData(null);
      return;
    }

    setLoading(true);
    setError(null);

    const promises: Promise<unknown>[] = [];

    if (effectiveFoundationId) {
      promises.push(
        getFoundationEntity(effectiveFoundationId)
          .then((data) => setFoundationData(data as FoundationEntity))
          .catch(() => setFoundationData(null))
      );
    } else if (foundationUri) {
      promises.push(
        getEntityByUri(foundationUri)
          .then((data) => setFoundationData(data as FoundationEntity))
          .catch(() => setFoundationData(null))
      );
    }

    if (effectiveMmsId) {
      promises.push(
        getMmsEntity(effectiveMmsId)
          .then((data) => setMmsData(data as MMSEntity))
          .catch(() => setMmsData(null))
      );
    } else if (linearizationUri) {
      promises.push(
        getEntityByUri(linearizationUri)
          .then((data) => setMmsData(data as MMSEntity))
          .catch(() => setMmsData(null))
      );
    }

    Promise.all(promises)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [foundationUri, linearizationUri, foundationId, mmsId]);

  if (loading) {
    return <div className="entity-detail loading">Loading...</div>;
  }

  if (error) {
    return <div className="entity-detail error">Error: {error}</div>;
  }

  if (!foundationData && !mmsData) {
    return <div className="entity-detail empty">Select an entity to view details</div>;
  }

  const displayEntity = mmsData || foundationData;

  return (
    <div className="entity-detail">
      {displayEntity && (
        <div className="entity-summary">
          <h2>
            {mmsData?.code && <span className="entity-code">{mmsData.code}</span>}
            {getText(displayEntity.title)}
          </h2>

          {displayEntity.definition && (
            <p className="entity-definition">{getText(displayEntity.definition)}</p>
          )}

          {displayEntity.parent && displayEntity.parent.length > 0 && (
            <div className="entity-parents">
              <strong>Parent{displayEntity.parent.length > 1 ? "s" : ""}:</strong>{" "}
              {displayEntity.parent.length} (
              {displayEntity.parent.length > 1 ? "polyhierarchy" : "single parent"})
            </div>
          )}

          {mmsData?.source && (
            <div className="entity-source">
              <strong>Foundation source:</strong>{" "}
              <code>{extractIdFromUri(mmsData.source)}</code>
            </div>
          )}

          {mmsData?.postcoordinationScale && mmsData.postcoordinationScale.length > 0 && (
            <div className="postcoordination-axes">
              <h3>Postcoordination Axes</h3>
              <ul>
                {mmsData.postcoordinationScale.map((axis, i) => (
                  <li key={i}>
                    {axis.axisName.split("/").pop()}
                    {axis.requiredPostcoordination === "true" && (
                      <span className="required-badge">required</span>
                    )}
                    {axis.allowMultipleValues === "true" && (
                      <span className="multiple-badge">multiple</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {displayEntity.exclusion && displayEntity.exclusion.length > 0 && (
            <div className="entity-exclusions">
              <h3>Exclusions</h3>
              <ul>
                {displayEntity.exclusion.map((excl, i) => (
                  <li key={i}>{getText(excl.label)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="raw-data">
        {mmsData && <JsonViewer data={mmsData} title="MMS Data" />}
        {foundationData && <JsonViewer data={foundationData} title="Foundation Data" />}
      </div>
    </div>
  );
}
