import button from './button.css';

/** @jsx h */
import { h } from 'hyperapp';
import classnames from '../../utils/classnames';

const IconButton = ({ className, filled, stroked, raised, size, label, ...otherProps }, children) => {
  const sz = size ? `-${size}` : '';
  const iconButtonClass = `Button--icon${sz}`;
  const { type='button', ...rest } = otherProps;

  return (
    <button
      class={classnames(
        className, {
          [button[iconButtonClass]]: true,
          [button['Button--filled']]: filled,
          [button['Button--stroked']]: !filled && stroked,
          [button['Button--raised']]: raised,
        })}
      type={type}
      aria-label={label}
      {...rest}
    >
      {children}
    </button>
  );
};

export default IconButton;
