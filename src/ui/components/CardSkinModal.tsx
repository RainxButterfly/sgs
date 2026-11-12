import { useEffect, useState } from 'react';
import type { Card } from '../../core/types';
import { cardEffectText } from '../cardEffects';
import { cardArtUrl, cardSkinList, selectCardSkin, subscribeCardSkins } from '../cardArt';
import { cardDisplayName, cardTypeText, rankText, SUIT_CHAR } from '../labels';
import { CardView } from './CardView';

interface Props {
  card: Card;
  onClose: () => void;
}

/** 卡牌图鉴里的牌面与皮肤选择：点击牌面打开，可切换皮肤（当前默认一套） */
export function CardSkinModal({ card, onClose }: Props) {
  const name = cardDisplayName(card);
  const [, force] = useState(0);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const unsub = subscribeCardSkins(() => force((v) => v + 1));
    return () => {
      window.removeEventListener('keydown', onKey);
      unsub();
    };
  }, [onClose]);

  const skins = cardSkinList(name);
  const current = cardArtUrl(name);

  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div
        className="hero-detail card-detail"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="detail-close" onClick={onClose} aria-label="收起卡牌详情">
          ×
        </button>
        <div className="detail-section-title card-detail-kicker">牌谱 · {cardTypeText(card)}</div>
        <div className="card-detail-hero">
          <CardView card={card} size="lg" />
          <div className="card-detail-meta">
            <div className="detail-name-row">
              <span className="detail-name">{name}</span>
            </div>
            <div className="detail-title">
              {SUIT_CHAR[card.suit]}
              {rankText(card.rank)} · {cardTypeText(card)}
            </div>
            {cardEffectText(card) && <p className="card-detail-effect">{cardEffectText(card)}</p>}
          </div>
        </div>

        {skins.length > 0 && (
          <>
            <div className="detail-section-title">皮肤 · 点击切换</div>
            <div className="detail-skins">
              {skins.map((skin) => (
                <div
                  key={skin.id}
                  className={`detail-skin ${skin.url === current ? 'is-on' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectCardSkin(name, skin.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') selectCardSkin(name, skin.id);
                  }}
                >
                  <span className="detail-skin-art" style={{ backgroundImage: `url("${skin.url}")` }} />
                  <span className="detail-skin-name">{skin.name}</span>
                  {skin.url === current && <span className="detail-skin-on">使用中</span>}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="modal-actions detail-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            收起详情
          </button>
        </div>
      </div>
    </div>
  );
}
