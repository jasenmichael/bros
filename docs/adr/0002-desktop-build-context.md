# Desktop build context lives in the data dir

A `kind: run` app is an image layer. The generated Dockerfile and those app copies have to sit where Docker can `COPY` them. Writing that context into the checkout stored this install's run set in the source tree.

The context is `$BROS_DIR/data/build/desktop`. Compose names that host path as the additional context `apps`. The image build context is the repo. The template Dockerfile stays at `lib/desktop/Dockerfile`. Run layers are `COPY --from=apps <id>`. The in-image path stays `/opt/bros/enabled-apps/<id>`.

Other package kinds never use this directory. They install after the Desktop session is up.

The extra context used to be `docker apps` and the generator rewrote `COPY core/desktop/`. That split is gone. See 0005.
