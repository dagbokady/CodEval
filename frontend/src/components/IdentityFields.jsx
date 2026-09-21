import { useRef, useState } from 'react';
import { Button } from './ui';

const PHOTO_SIZE = 256;

/**
 * Recadre l'image au carré, au centre, et la réduit à 256 px en JPEG : la
 * photo reste légère, quelle que soit celle qu'on choisit.
 */
function toProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = PHOTO_SIZE;
      canvas.height = PHOTO_SIZE;
      canvas
        .getContext('2d')
        .drawImage(
          image,
          (image.naturalWidth - side) / 2,
          (image.naturalHeight - side) / 2,
          side,
          side,
          0,
          0,
          PHOTO_SIZE,
          PHOTO_SIZE,
        );
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Cette image ne peut pas être lue. Choisissez une photo JPEG ou PNG.'));
    };
    image.src = url;
  });
}

/** Choix de la photo de profil, avec son aperçu rond. */
export function PhotoPicker({ value, onChange, onError, hint }) {
  const input = useRef(null);
  const [reading, setReading] = useState(false);

  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onError('Choisissez une image (JPEG, PNG ou WebP).');
      return;
    }
    setReading(true);
    try {
      onChange(await toProfilePhoto(file));
      onError(null);
    } catch (err) {
      onError(err.message);
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="photo-picker">
      <button
        type="button"
        className="photo-picker-preview"
        onClick={() => input.current?.click()}
        aria-label={value ? 'Changer de photo' : 'Ajouter une photo'}
      >
        {value ? <img src={value} alt="" /> : <span aria-hidden="true">+</span>}
      </button>
      <div className="photo-picker-text">
        <strong>Votre photo</strong>
        <span>{hint}</span>
        <Button
          variant="secondary"
          size="small"
          disabled={reading}
          onClick={() => input.current?.click()}
        >
          {reading ? 'Lecture…' : value ? 'Changer' : 'Choisir une photo'}
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={onFile}
      />
    </div>
  );
}

const GENDERS = [
  { value: 'F', label: 'Femme' },
  { value: 'M', label: 'Homme' },
];

/** Le sexe, en deux choix côte à côte : il accorde « Enseignante », « Étudiante ». */
export function GenderField({ value, onChange, name = 'gender' }) {
  return (
    <fieldset className="field gender-field">
      <legend>Sexe</legend>
      <div className="gender-options">
        {GENDERS.map((option) => (
          <label key={option.value} className="gender-option">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
