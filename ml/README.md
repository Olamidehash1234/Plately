# Training the food classification model

Run in order:

```bash
python ml/fetch_food101.py                                     # half the data, automatically
python ml/collect_nigerian.py init                             # folders for the other half
python ml/collect_nigerian.py add jollof_rice ~/photos/        # …once you have photographed them
python ml/prepare_data.py --food101 ml/raw_food101 --nigerian ml/raw_nigerian
python ml/train.py                                             # train
python ml/evaluate.py                                          # metrics for Chapter 4
python ml/export_tflite.py                                     # slim model for deployment
```

Everything they produce lands in `ml/artifacts/`. The backend reads two files
from there — `model.keras` and `class_indices.json` — and needs nothing else.

---

## 1. Get the data

### Food-101 (6 of the 12 classes) — automatic

```bash
python ml/fetch_food101.py
```

Six of the 101 categories are ours: `caesar_salad`, `french_fries`,
`fried_rice`, `grilled_salmon`, `hamburger`, `pizza`. The class keys were
chosen to match Food-101's own folder names, so nothing needs renaming.

The script streams the official 5GB archive from ETH Zurich and writes only
those six classes — about 300MB — into `ml/raw_food101/`. It stops reading once
they are all in, needs no Kaggle account, and can be re-run to resume: images
already on disk are left alone.

```bash
python ml/fetch_food101.py --per-class 300      # how many to keep (default 300)
python ml/fetch_food101.py --archive food-101.tar.gz   # a copy you already have
python ml/fetch_food101.py --check              # what is on disk
```

If your connection cannot sustain a 5GB stream, run the whole pipeline in
Colab instead (section 5), where the download is fast and free.

### Nigerian dishes (the other 6) — you photograph them

No public dataset covers jollof rice, egusi soup, pounded yam, amala, eba or
moi moi. These photos are the one input to this project that cannot be
regenerated, so back them up somewhere outside the checkout.

```bash
python ml/collect_nigerian.py init
```

That creates a folder per dish under `ml/raw_nigerian/`, each with a
`SHOT_LIST.txt` reminding you what to vary. Then, as you shoot:

```bash
python ml/collect_nigerian.py add jollof_rice ~/phone-photos/
python ml/collect_nigerian.py status
```

`add` takes files or whole folders and, for each image: checks it opens,
applies the camera's rotation, strips the remaining EXIF (which carries GPS),
converts to RGB JPEG, shrinks anything over 1024px, and refuses it if it
duplicates something already stored or is smaller than the 224px training
size. Soft-focus shots are flagged, and dropped entirely with
`--reject-blurry`. Re-running the same command adds nothing twice.

**Why duplicates matter.** `prepare_data.py` splits at random, so the same
plate appearing twice can land in both train and test — and the accuracy you
report in Chapter 4 is then partly measured on images the model has already
seen. `add` catches re-encodes and burst frames as well as exact copies;
`prune` removes any that slipped in earlier.

```bash
python ml/collect_nigerian.py check     # full re-scan: duplicates, soft focus, unreadable
python ml/collect_nigerian.py prune     # delete what check found
```

**How many.** Chapter 3 describes ~59 training images per class. That will
train, but it is thin, and accuracy will be fragile on any photo taken
differently from your training shots. Aim for **150–300 per dish**. This is the
single highest-leverage thing you can do for the final accuracy number.
`status` shows a bar per class and names the one furthest behind.

**What to vary.** The model learns whatever is consistent in your photos, so if
every jollof rice picture is on the same plate on the same table, it may learn
the plate rather than the rice. Vary deliberately:

- lighting — daylight, indoor bulb, evening
- angle — directly overhead, 45 degrees, eye level
- dishware — different plates, bowls, colours
- portion and plating — full plate, half eaten, served with sides
- background — table, counter, tray

Take them on a phone; training resizes everything to 224×224 anyway, so
resolution beyond that is wasted.

**Where to be careful.** Amala, eba and pounded yam are all brown-to-white
swallows of similar shape. They are the classes most likely to be confused, and
Chapter 1's "low inter-class variance" problem in concrete form. Give them the
most images and the most variation — `status` marks them for this reason.

### Build the dataset

```bash
python ml/prepare_data.py \
    --food101 ml/raw_food101 \
    --nigerian ml/raw_nigerian \
    --limit-per-class 250
```

This shuffles with a fixed seed, splits 75/25 as Chapter 3 specifies, and
writes `ml/dataset/train/<class>/` and `ml/dataset/test/<class>/`. It prints
per-class counts and warns if any class is thin or the set is imbalanced.

`--limit-per-class` matters: Food-101 ships 1000 images per class. Without a
cap, the six international classes would outnumber your Nigerian ones roughly
5:1 and the model would learn to prefer them.

---

## 2. Train

```bash
python ml/train.py
```

Two phases, automatically:

**Phase 1 — head training (15 epochs, lr 1e-3).** MobileNetV2 pretrained on
ImageNet, with its convolutional base frozen and a new 12-way classifier on
top. The base already knows edges, textures and shapes from a million images;
you are only teaching the final layer to map those features onto your dishes.
This is why ~2000 images is enough — training a CNN from scratch on this much
data would just memorise it.

**Phase 2 — fine-tuning (10 epochs, lr 1e-5).** Unfreezes the top 30 layers so
the later filters can specialise onto food. Usually worth several accuracy
points.

The learning rate drop between phases is not optional. Fine-tuning at phase 1's
rate destroys the pretrained features in the first few batches — the model's
accuracy collapses and never recovers. If you change one number here, don't
change that one.

Useful flags:

```bash
python ml/train.py --no-fine-tune          # phase 1 only, roughly half the time
python ml/train.py --epochs 25             # longer phase 1
python ml/train.py --batch-size 16         # if you hit out-of-memory
```

Training stops early if validation accuracy plateaus for 5 epochs, and always
keeps the best weights rather than the last ones.

---

## 3. Evaluate

```bash
python ml/evaluate.py
```

Runs the held-out `test/` split — data the model has never seen and which never
influenced training — and writes to `ml/artifacts/reports/`:

| File | What it is |
|---|---|
| `metrics.json` | accuracy, macro precision/recall/F1, per-class breakdown |
| `classification_report.txt` | the per-class table, ready to paste into Chapter 4 |
| `confusion_matrix.png` | which classes get mistaken for which |
| `training_curves.png` | accuracy and loss per epoch, both phases |

**Read the confusion matrix, not just the accuracy.** It tells you *how* the
model fails. If amala and eba are being swapped, that is a data problem — go
photograph more of both — not a reason to train longer. The script prints the
single most-confused pair for you.

**Read the training curves too.** If training accuracy climbs while validation
accuracy flattens or falls, the model is overfitting and you need more or more
varied images, not more epochs.

---

## 4. Install the model into the backend

`ml/train.py` writes straight to the path the backend already reads, so there
is nothing to copy. Just make sure the backend has TensorFlow:

```bash
cd backend
source .venv/bin/activate
pip install -r requirements-ml.txt
```

Restart the API and check:

```bash
curl http://localhost:8000/classify/status
# {"ready": true, "reason": null}
```

Until then that endpoint tells you exactly what is missing — TensorFlow, the
model file, or the class index.

---

## 5. Running on Colab (recommended)

Chapter 3 lists the target machine as an 8GB i5 with no GPU. Training will run
there, but expect several minutes per epoch and an hour or more per full run —
and you will not get this right on the first attempt.

[Google Colab](https://colab.research.google.com) gives you a free T4 GPU,
which cuts a full run to a few minutes. Same scripts, no changes.

1. Upload your `raw_nigerian/` folder to Google Drive
2. New notebook → Runtime → Change runtime type → **T4 GPU**
3. In a cell:

```python
from google.colab import drive
drive.mount('/content/drive')

!git clone <your-repo-url> /content/project
%cd /content/project
!pip install -q -r backend/requirements-ml.txt

# Six Food-101 classes, straight from the source. No Kaggle token needed.
!python ml/fetch_food101.py

!python ml/prepare_data.py \
    --food101 ml/raw_food101 \
    --nigerian /content/drive/MyDrive/raw_nigerian \
    --limit-per-class 250

!python ml/train.py
!python ml/evaluate.py
!python ml/export_tflite.py
```

4. Download `ml/artifacts/` when it finishes, and drop it into your local
   checkout at the same path.

Colab disconnects idle sessions, so download the artifacts as soon as training
completes rather than leaving the tab open.

---

## Reproducibility

Every random step — the train/test split, shuffling, augmentation, weight
initialisation — is seeded from `SEED` in `ml/common.py`. Re-running the same
commands on the same data gives the same model, which is what makes the numbers
in Chapter 4 defensible if anyone asks you to reproduce them.

Note that GPU non-determinism means Colab results can still differ in the last
decimal place from a CPU run. That is expected and worth a footnote rather than
an investigation.

## What is versioned

The scripts are; the data is not. `ml/raw_food101/`, `ml/dataset/` and
`ml/artifacts/` are all gitignored and can be rebuilt from scratch:

```bash
python ml/fetch_food101.py && python ml/prepare_data.py \
    --food101 ml/raw_food101 --nigerian ml/raw_nigerian
python ml/train.py && python ml/evaluate.py && python ml/export_tflite.py
```

`ml/raw_nigerian/` is gitignored too, but it is the exception: nothing can
regenerate those photographs. Back them up somewhere outside this checkout.
